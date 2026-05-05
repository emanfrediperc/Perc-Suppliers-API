import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  SolicitudPago,
  SolicitudPagoDocument,
  EstadoSolicitud,
  TipoComprobante,
} from './schemas/solicitud-pago.schema';
import { Factura, FacturaDocument } from '../factura/schemas/factura.schema';
import { Pago, PagoDocument } from '../pago/schemas/pago.schema';
import { Convenio, ConvenioDocument } from '../convenio/schemas/convenio.schema';
import { CreateSolicitudPagoDto } from './dto/create-solicitud-pago.dto';
import { CancelarDto, ReagendarDto } from './dto/transition.dto';
import { ProcesarSolicitudPagoDto } from './dto/procesar.dto';
import { SolicitudPagoQueryDto } from './dto/query.dto';
import { StorageService } from '../../integrations/storage/storage.service';
import { PagoCalculatorService } from '../../common/services/pago-calculator.service';

interface AuthUser { userId: string; email?: string; role?: string }

const TRANSITIONS: Record<string, EstadoSolicitud[]> = {
  aprobar: ['pendiente'],
  ejecutar: ['en_proceso'],
  procesar: ['pago_en_proceso_perc'],
  cancelar: ['pendiente', 'en_proceso', 'pago_en_proceso_perc'],
  reagendar: ['pendiente', 'en_proceso', 'pago_en_proceso_perc'],
};

@Injectable()
export class SolicitudPagoService {
  constructor(
    @InjectModel(SolicitudPago.name) private solicitudModel: Model<SolicitudPagoDocument>,
    @InjectModel(Factura.name) private facturaModel: Model<FacturaDocument>,
    @InjectModel(Pago.name) private pagoModel: Model<PagoDocument>,
    @InjectModel(Convenio.name) private convenioModel: Model<ConvenioDocument>,
    private storageService: StorageService,
    private pagoCalculator: PagoCalculatorService,
  ) {}

  async create(dto: CreateSolicitudPagoDto, user: AuthUser): Promise<SolicitudPagoDocument> {
    const factura = await this.facturaModel.findById(dto.factura);
    if (!factura) throw new NotFoundException('Factura no encontrada');
    if (factura.estado === 'anulada' || factura.estado === 'pagada') {
      throw new BadRequestException(`Factura está ${factura.estado}, no admite solicitud de pago`);
    }
    if (dto.monto > factura.saldoPendiente) {
      throw new BadRequestException(`Monto excede saldo pendiente (${factura.saldoPendiente})`);
    }
    if (dto.tipo === 'compromiso') {
      if (!dto.fechaVencimiento) throw new BadRequestException('Compromiso requiere fechaVencimiento');
      const fv = new Date(dto.fechaVencimiento);
      if (fv.getTime() <= Date.now()) {
        throw new BadRequestException('fechaVencimiento debe ser futura');
      }
    }

    const ahora = new Date();
    const solicitud = await this.solicitudModel.create({
      factura: factura._id,
      empresaProveedora: factura.empresaProveedora,
      tipo: dto.tipo,
      monto: dto.monto,
      fechaVencimiento: dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : undefined,
      nota: dto.nota,
      medioPago: dto.medioPago,
      bancoOrigen: dto.bancoOrigen,
      estado: 'pendiente',
      createdBy: { user: new Types.ObjectId(user.userId), fecha: ahora },
      historial: [{
        accion: 'crear',
        usuario: new Types.ObjectId(user.userId),
        estadoNuevo: 'pendiente',
        fecha: ahora,
      }],
    });
    return solicitud;
  }

  async findAll(query: SolicitudPagoQueryDto) {
    const { page = 1, limit = 20, ...filter } = query;
    const q: any = {};
    if (filter.estado) q.estado = filter.estado;
    if (filter.tipo) q.tipo = filter.tipo;
    if (filter.factura) q.factura = new Types.ObjectId(filter.factura);
    if (filter.empresaProveedora) q.empresaProveedora = new Types.ObjectId(filter.empresaProveedora);

    const [data, total] = await Promise.all([
      this.solicitudModel
        .find(q)
        .populate('factura', 'numero tipo fecha montoTotal saldoPendiente')
        .populate('empresaProveedora', 'razonSocial cuit')
        .populate('createdBy.user', 'nombre apellido email')
        .populate('aprobadoPor.user', 'nombre apellido email')
        .populate('ejecutadoPor.user', 'nombre apellido email')
        .populate('procesadoPor.user', 'nombre apellido email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      this.solicitudModel.countDocuments(q),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string): Promise<SolicitudPagoDocument> {
    const sol = await this.solicitudModel
      .findById(id)
      .populate('factura')
      .populate('empresaProveedora', 'razonSocial cuit')
      .populate('createdBy.user', 'nombre apellido email')
      .populate('aprobadoPor.user', 'nombre apellido email')
      .populate('ejecutadoPor.user', 'nombre apellido email')
      .populate('procesadoPor.user', 'nombre apellido email')
      .populate('canceladoPor.user', 'nombre apellido email')
      .populate('historial.usuario', 'nombre apellido email');
    if (!sol) throw new NotFoundException('Solicitud de pago no encontrada');
    return sol;
  }

  async aprobar(id: string, motivo: string | undefined, user: AuthUser): Promise<SolicitudPagoDocument> {
    return this.transicion(id, 'aprobar', 'en_proceso', user, motivo, doc => {
      doc.aprobadoPor = { user: new Types.ObjectId(user.userId), fecha: new Date(), motivo } as any;
    });
  }

  async ejecutar(id: string, motivo: string | undefined, user: AuthUser): Promise<SolicitudPagoDocument> {
    return this.transicion(id, 'ejecutar', 'pago_en_proceso_perc', user, motivo, doc => {
      doc.ejecutadoPor = { user: new Types.ObjectId(user.userId), fecha: new Date(), motivo } as any;
    });
  }

  async procesar(
    id: string,
    dto: ProcesarSolicitudPagoDto,
    files: { perc?: Express.Multer.File; retenciones?: Express.Multer.File },
    user: AuthUser,
  ): Promise<SolicitudPagoDocument> {
    if (!files.perc || !files.retenciones) {
      throw new BadRequestException('Procesar requiere ambos comprobantes (perc y retenciones)');
    }
    const sol = await this.solicitudModel.findById(id);
    if (!sol) throw new NotFoundException('Solicitud no encontrada');
    if (!TRANSITIONS.procesar.includes(sol.estado)) {
      throw new BadRequestException(`No se puede procesar desde estado "${sol.estado}"`);
    }

    const ahora = new Date();
    const userId = new Types.ObjectId(user.userId);

    // Subir comprobantes en paralelo
    const subidos = await Promise.all(
      (['perc', 'retenciones'] as TipoComprobante[]).map(async tipo => {
        const file = files[tipo]!;
        const uploaded = await this.storageService.upload(file, `solicitud-pago/${id}/${tipo}`);
        return {
          tipo,
          url: uploaded.url,
          key: uploaded.key,
          nombre: file.originalname,
          subidoPor: userId,
          fecha: ahora,
        };
      }),
    );

    // Calcular comision/descuento via convenio + retenciones
    const convenio = await this.convenioModel
      .findOne({ empresaProveedora: sol.empresaProveedora, activo: true })
      .lean();
    const calc = this.pagoCalculator.calculate(
      sol.monto,
      {
        retencionIIBB: dto.retencionIIBB || 0,
        retencionGanancias: dto.retencionGanancias || 0,
        retencionIVA: dto.retencionIVA || 0,
        retencionSUSS: dto.retencionSUSS || 0,
        otrasRetenciones: dto.otrasRetenciones || 0,
      },
      convenio
        ? {
            comisionPorcentaje: convenio.comisionPorcentaje,
            descuentoPorcentaje: convenio.descuentoPorcentaje,
            reglas: convenio.reglas,
          }
        : null,
    );

    // Crear el Pago real
    const pago = await this.pagoModel.create({
      factura: sol.factura,
      fechaPago: ahora,
      montoBase: sol.monto,
      retencionIIBB: dto.retencionIIBB || 0,
      retencionGanancias: dto.retencionGanancias || 0,
      retencionIVA: dto.retencionIVA || 0,
      retencionSUSS: dto.retencionSUSS || 0,
      otrasRetenciones: dto.otrasRetenciones || 0,
      comision: calc.comision,
      porcentajeComision: calc.porcentajeComision,
      descuento: calc.descuento,
      porcentajeDescuento: calc.porcentajeDescuento,
      montoNeto: calc.montoNeto,
      medioPago: sol.medioPago,
      referenciaPago: dto.referenciaPago,
      observaciones: dto.observaciones,
      convenioAplicado: convenio?._id,
      estado: 'confirmado',
    });

    // Recalcular saldo de factura
    const factura = await this.facturaModel.findById(sol.factura);
    if (factura) {
      const pagosActivos = await this.pagoModel
        .find({ factura: factura._id, estado: { $nin: ['anulado', 'rechazado'] } })
        .lean();
      const montoPagado = pagosActivos.reduce((sum, p) => sum + p.montoBase, 0);
      factura.montoPagado = montoPagado;
      factura.saldoPendiente = Math.max(0, factura.montoTotal - montoPagado);
      if (factura.saldoPendiente <= 0) factura.estado = 'pagada';
      else if (montoPagado > 0) factura.estado = 'parcial';
      await factura.save();
    }

    // Cerrar la solicitud
    const estadoAnterior = sol.estado;
    sol.estado = 'procesado';
    sol.procesadoPor = { user: userId, fecha: ahora } as any;
    sol.comprobantes.push(...(subidos as any));
    sol.pagoGenerado = pago._id as any;
    sol.historial.push({
      accion: 'procesar',
      usuario: userId,
      estadoAnterior,
      estadoNuevo: 'procesado',
      fecha: ahora,
    } as any);
    await sol.save();
    return sol;
  }

  async cancelar(id: string, dto: CancelarDto, user: AuthUser): Promise<SolicitudPagoDocument> {
    const sol = await this.solicitudModel.findById(id);
    if (!sol) throw new NotFoundException('Solicitud no encontrada');
    this.assertCompromisoEditable(sol);
    return this.transicion(id, 'cancelar', 'cancelado', user, dto.motivo, doc => {
      doc.canceladoPor = { user: new Types.ObjectId(user.userId), fecha: new Date(), motivo: dto.motivo } as any;
    });
  }

  async reagendar(id: string, dto: ReagendarDto, user: AuthUser): Promise<SolicitudPagoDocument> {
    const sol = await this.solicitudModel.findById(id);
    if (!sol) throw new NotFoundException('Solicitud no encontrada');
    this.assertCompromisoEditable(sol);
    if (!TRANSITIONS.reagendar.includes(sol.estado)) {
      throw new BadRequestException(`No se puede reagendar desde estado "${sol.estado}"`);
    }
    const nueva = new Date(dto.nuevaFecha);
    if (nueva.getTime() <= Date.now()) {
      throw new BadRequestException('Nueva fecha debe ser futura');
    }
    const fechaAnterior = sol.fechaVencimiento;
    const ahora = new Date();
    const userId = new Types.ObjectId(user.userId);
    sol.fechaVencimiento = nueva;
    sol.reagendadoVeces += 1;
    sol.historial.push({
      accion: 'reagendar',
      usuario: userId,
      motivo: dto.motivo,
      fechaAnterior,
      fechaNueva: nueva,
      fecha: ahora,
    } as any);
    await sol.save();
    return sol;
  }

  // ── helpers ──────────────────────────────────────────────────────────

  private async transicion(
    id: string,
    accion: keyof typeof TRANSITIONS,
    estadoNuevo: EstadoSolicitud,
    user: AuthUser,
    motivo: string | undefined,
    mutate: (doc: SolicitudPagoDocument) => void,
  ): Promise<SolicitudPagoDocument> {
    const sol = await this.solicitudModel.findById(id);
    if (!sol) throw new NotFoundException('Solicitud no encontrada');
    const allowed = TRANSITIONS[accion];
    if (!allowed.includes(sol.estado)) {
      throw new BadRequestException(`No se puede ${accion} desde estado "${sol.estado}"`);
    }
    const estadoAnterior = sol.estado;
    sol.estado = estadoNuevo;
    mutate(sol);
    sol.historial.push({
      accion,
      usuario: new Types.ObjectId(user.userId),
      motivo,
      estadoAnterior,
      estadoNuevo,
      fecha: new Date(),
    } as any);
    await sol.save();
    return sol;
  }

  private assertCompromisoEditable(sol: SolicitudPagoDocument) {
    if (sol.tipo !== 'compromiso') {
      throw new ForbiddenException('Solo compromisos pueden cancelarse o reagendarse');
    }
    if (!sol.fechaVencimiento || sol.fechaVencimiento.getTime() > Date.now()) {
      throw new ForbiddenException(
        'Compromiso solo modificable en o después de la fecha de vencimiento',
      );
    }
  }
}
