import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
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
import { OrdenPago, OrdenPagoDocument } from '../orden-pago/schemas/orden-pago.schema';
import { Convenio, ConvenioDocument } from '../convenio/schemas/convenio.schema';
import { User, UserDocument } from '../../auth/schemas/user.schema';
import { CreateSolicitudPagoDto } from './dto/create-solicitud-pago.dto';
import { CancelarDto, ReagendarDto } from './dto/transition.dto';
import { ProcesarSolicitudPagoDto } from './dto/procesar.dto';
import { SolicitudPagoQueryDto } from './dto/query.dto';
import { StorageService } from '../../integrations/storage/storage.service';
import { PagoCalculatorService } from '../../common/services/pago-calculator.service';
import { EmailService } from '../../integrations/email/email.service';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HashChainService } from './hash-chain.service';
import { TsaClient } from './tsa.client';

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
  private readonly logger = new Logger(SolicitudPagoService.name);

  constructor(
    @InjectModel(SolicitudPago.name) private solicitudModel: Model<SolicitudPagoDocument>,
    @InjectModel(Factura.name) private facturaModel: Model<FacturaDocument>,
    @InjectModel(Pago.name) private pagoModel: Model<PagoDocument>,
    @InjectModel(OrdenPago.name) private ordenModel: Model<OrdenPagoDocument>,
    @InjectModel(Convenio.name) private convenioModel: Model<ConvenioDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private storageService: StorageService,
    private pagoCalculator: PagoCalculatorService,
    private emailService: EmailService,
    private config: ConfigService,
    private hashChain: HashChainService,
    private tsa: TsaClient,
  ) {}

  async create(dto: CreateSolicitudPagoDto, user: AuthUser): Promise<SolicitudPagoDocument> {
    if (!dto.factura === !dto.ordenPago) {
      throw new BadRequestException('Debe especificarse exactamente uno: factura u ordenPago');
    }
    if (dto.tipo === 'compromiso') {
      if (!dto.fechaVencimiento) throw new BadRequestException('Compromiso requiere fechaVencimiento');
      if (new Date(dto.fechaVencimiento).getTime() <= Date.now()) {
        throw new BadRequestException('fechaVencimiento debe ser futura');
      }
    }

    let empresaProveedora: Types.ObjectId;
    let saldoDisponible: number;
    let displayRef: string;

    if (dto.factura) {
      const factura = await this.facturaModel.findById(dto.factura);
      if (!factura) throw new NotFoundException('Factura no encontrada');
      if (factura.estado === 'anulada' || factura.estado === 'pagada') {
        throw new BadRequestException(`Factura está ${factura.estado}, no admite solicitud de pago`);
      }
      empresaProveedora = factura.empresaProveedora;
      saldoDisponible = factura.saldoPendiente;
      displayRef = `Factura ${factura.numero}`;
    } else {
      const orden = await this.ordenModel.findById(dto.ordenPago);
      if (!orden) throw new NotFoundException('Orden de pago no encontrada');
      if (orden.estado === 'anulada' || orden.estado === 'pagada') {
        throw new BadRequestException(`Orden está ${orden.estado}, no admite solicitud de pago`);
      }
      empresaProveedora = orden.empresaProveedora as any;
      saldoDisponible = orden.saldoPendiente;
      displayRef = `Orden ${orden.numero}`;
    }

    // Solicitudes activas (no procesadas/canceladas) ya comprometen saldo
    const activasFilter: any = { estado: { $in: ['pendiente', 'en_proceso', 'pago_en_proceso_perc'] } };
    if (dto.factura) activasFilter.factura = new Types.ObjectId(dto.factura);
    else activasFilter.ordenPago = new Types.ObjectId(dto.ordenPago!);
    const activas = await this.solicitudModel.find(activasFilter, { monto: 1 }).lean();
    const yaComprometido = activas.reduce((sum, s) => sum + (s.monto || 0), 0);
    const disponibleReal = saldoDisponible - yaComprometido;

    if (dto.monto > disponibleReal) {
      throw new BadRequestException(
        `Monto excede saldo disponible. Saldo pendiente: ${saldoDisponible}, ya comprometido en otras solicitudes activas: ${yaComprometido}, disponible: ${disponibleReal}`,
      );
    }

    const ahora = new Date();
    const userId = new Types.ObjectId(user.userId);
    const firstEntry = await this.buildHistorialEntry('', {
      accion: 'crear',
      usuario: userId,
      estadoNuevo: 'pendiente',
      fecha: ahora,
    });
    const solicitud = await this.solicitudModel.create({
      factura: dto.factura ? new Types.ObjectId(dto.factura) : undefined,
      ordenPago: dto.ordenPago ? new Types.ObjectId(dto.ordenPago) : undefined,
      empresaProveedora,
      tipo: dto.tipo,
      monto: dto.monto,
      fechaVencimiento: dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : undefined,
      nota: dto.nota,
      medioPago: dto.medioPago,
      bancoOrigen: dto.bancoOrigen,
      estado: 'pendiente',
      createdBy: { user: userId, fecha: ahora },
      historial: [firstEntry],
    });

    this.notificarContabilidad(solicitud, displayRef).catch(err =>
      this.logger.warn(`No se pudo notificar a contabilidad: ${err.message}`),
    );

    return solicitud;
  }

  async findAll(query: SolicitudPagoQueryDto) {
    const { page = 1, limit = 20, ...filter } = query;
    const q: any = {};
    if (filter.estado) q.estado = filter.estado;
    if (filter.tipo) q.tipo = filter.tipo;
    if (filter.factura) q.factura = new Types.ObjectId(filter.factura);
    if (filter.ordenPago) q.ordenPago = new Types.ObjectId(filter.ordenPago);
    if (filter.empresaProveedora) q.empresaProveedora = new Types.ObjectId(filter.empresaProveedora);

    const [data, total] = await Promise.all([
      this.solicitudModel
        .find(q)
        .populate('factura', 'numero tipo fecha montoTotal saldoPendiente')
        .populate('ordenPago', 'numero fecha montoTotal saldoPendiente')
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
      .populate('ordenPago')
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
    const current = await this.solicitudModel.findById(id);
    if (!current) throw new NotFoundException('Solicitud no encontrada');
    if (!TRANSITIONS.procesar.includes(current.estado)) {
      throw new BadRequestException(`No se puede procesar desde estado "${current.estado}"`);
    }

    // Adquisición atómica del estado "procesado"
    const sol = await this.solicitudModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), estado: current.estado },
      { $set: { estado: 'procesado' } },
      { new: true },
    );
    if (!sol) {
      throw new ConflictException('La solicitud ya fue procesada por otro usuario');
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
      ordenPago: sol.ordenPago,
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

    if (sol.factura) {
      await this.recalcFacturaSaldo(sol.factura);
    } else if (sol.ordenPago) {
      await this.aplicarPagoAOrden(sol.ordenPago, sol.monto, pago._id as any);
    }

    // Estado ya fue puesto en 'procesado' arriba, ahora completamos audit
    sol.procesadoPor = { user: userId, fecha: ahora } as any;
    sol.comprobantes.push(...(subidos as any));
    sol.pagoGenerado = pago._id as any;
    await this.pushHistorial(sol, {
      accion: 'procesar',
      usuario: userId,
      estadoAnterior: current.estado,
      estadoNuevo: 'procesado',
      fecha: ahora,
    });
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
    await this.pushHistorial(sol, {
      accion: 'reagendar',
      usuario: userId,
      motivo: dto.motivo,
      fechaAnterior,
      fechaNueva: nueva,
      fecha: ahora,
    });
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
    const allowed = TRANSITIONS[accion];
    const current = await this.solicitudModel.findById(id);
    if (!current) throw new NotFoundException('Solicitud no encontrada');
    if (!allowed.includes(current.estado)) {
      throw new BadRequestException(`No se puede ${accion} desde estado "${current.estado}"`);
    }
    const estadoAnterior = current.estado;

    // Adquisición atómica: solo un caller gana la transición.
    const sol = await this.solicitudModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), estado: estadoAnterior },
      { $set: { estado: estadoNuevo } },
      { new: true },
    );
    if (!sol) {
      throw new ConflictException(
        `La solicitud ya fue modificada por otro usuario, recargá y reintentá`,
      );
    }

    mutate(sol);
    await this.pushHistorial(sol, {
      accion,
      usuario: new Types.ObjectId(user.userId),
      motivo,
      estadoAnterior,
      estadoNuevo,
      fecha: new Date(),
    });
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

  private async recalcFacturaSaldo(facturaId: any): Promise<void> {
    const factura = await this.facturaModel.findById(facturaId);
    if (!factura) return;
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

  private async aplicarPagoAOrden(ordenId: any, monto: number, pagoId: Types.ObjectId): Promise<void> {
    const orden = await this.ordenModel.findById(ordenId).populate('facturas');
    if (!orden) return;

    orden.montoPagado = (orden.montoPagado || 0) + monto;
    orden.saldoPendiente = Math.max(0, orden.montoTotal - orden.montoPagado);
    (orden.pagos as any[]).push(pagoId);
    orden.estado = orden.saldoPendiente <= 0 ? 'pagada' : 'parcial';
    await orden.save();

    // Distribuir el monto entre las facturas pendientes (más viejas primero)
    let restante = monto;
    const facturasPendientes = (orden.facturas as any[])
      .filter((f: any) => f.estado !== 'pagada' && f.estado !== 'anulada')
      .sort((a: any, b: any) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

    for (const factura of facturasPendientes) {
      if (restante <= 0) break;
      const aplicar = Math.min(restante, factura.saldoPendiente);
      factura.montoPagado += aplicar;
      factura.saldoPendiente = Math.max(0, factura.montoTotal - factura.montoPagado);
      if (factura.saldoPendiente <= 0) {
        factura.saldoPendiente = 0;
        factura.estado = 'pagada';
      } else {
        factura.estado = 'parcial';
      }
      await factura.save();
      restante -= aplicar;
    }
  }

  /**
   * Construye una entry de historial completa (con hash encadenado y sello TSA).
   * Usable tanto para el primer entry (al crear) como para entries de transición.
   */
  private async buildHistorialEntry(
    prevHash: string,
    entry: { accion: string; usuario: Types.ObjectId; motivo?: string; estadoAnterior?: string; estadoNuevo?: string; fechaAnterior?: Date; fechaNueva?: Date; fecha: Date },
  ): Promise<any> {
    const hash = this.hashChain.computeHash(prevHash, entry as any);
    const tsa = await this.tsa.timestamp(hash);
    return {
      ...entry,
      hash,
      tsaToken: tsa.token ?? undefined,
      tsaError: tsa.error,
    };
  }

  private async pushHistorial(
    sol: SolicitudPagoDocument,
    entry: { accion: string; usuario: Types.ObjectId; motivo?: string; estadoAnterior?: string; estadoNuevo?: string; fechaAnterior?: Date; fechaNueva?: Date; fecha: Date },
  ): Promise<void> {
    const prev = sol.historial.length > 0 ? sol.historial[sol.historial.length - 1].hash : '';
    const completeEntry = await this.buildHistorialEntry(prev, entry);
    sol.historial.push(completeEntry);
  }

  /**
   * Verifica integridad de la cadena de historial.
   */
  async pendingCountForRole(role: string): Promise<{ count: number; estado: string | null }> {
    const map: Record<string, EstadoSolicitud> = {
      contabilidad: 'pendiente',
      tesoreria: 'en_proceso',
      operador: 'pago_en_proceso_perc',
    };
    const estado = map[role] ?? null;
    if (!estado && role !== 'admin') return { count: 0, estado: null };

    if (role === 'admin') {
      const count = await this.solicitudModel.countDocuments({
        estado: { $in: ['pendiente', 'en_proceso', 'pago_en_proceso_perc'] },
      });
      return { count, estado: null };
    }
    const count = await this.solicitudModel.countDocuments({ estado });
    return { count, estado };
  }

  async getComprobanteUrl(id: string, tipo: 'perc' | 'retenciones'): Promise<{ url: string; nombre: string }> {
    const sol = await this.solicitudModel.findById(id).lean();
    if (!sol) throw new NotFoundException('Solicitud no encontrada');
    const comp = (sol.comprobantes || []).find((c: any) => c.tipo === tipo);
    if (!comp) throw new NotFoundException(`Comprobante "${tipo}" no encontrado`);
    const url = await this.storageService.getSignedDownloadUrl(comp.key);
    return { url, nombre: comp.nombre };
  }

  async verificarIntegridad(id: string): Promise<{ valid: boolean; brokenAt: number | null; total: number; conTsa: number }> {
    const sol = await this.solicitudModel.findById(id).lean();
    if (!sol) throw new NotFoundException('Solicitud no encontrada');
    const result = this.hashChain.verifyChain(sol.historial as any);
    const conTsa = sol.historial.filter((e: any) => !!e.tsaToken).length;
    return { ...result, total: sol.historial.length, conTsa };
  }

  private async notificarContabilidad(
    sol: SolicitudPagoDocument,
    displayRef: string,
  ): Promise<void> {
    const recipients = await this.userModel
      .find({ role: 'contabilidad', activo: true })
      .select('email')
      .lean();
    if (recipients.length === 0) {
      this.logger.warn('No hay usuarios con rol contabilidad activos para notificar');
      return;
    }
    const baseUrl = this.config.get<string>('CORS_ORIGIN') || 'http://localhost:4200';
    const link = `${baseUrl}/solicitudes-pago/${sol._id}`;
    const tipoLabel = sol.tipo === 'compromiso' ? 'Compromiso de Pago' : 'Solicitud de Pago';
    const fechaVenc = sol.fechaVencimiento
      ? sol.fechaVencimiento.toLocaleDateString('es-AR')
      : '—';
    const monto = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(
      sol.monto,
    );
    const subject = `[Perc] Nueva ${tipoLabel} pendiente de aprobación`;
    const html = `
      <h2>Nueva ${tipoLabel} pendiente</h2>
      <p>Se generó una solicitud que requiere tu aprobación.</p>
      <table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
        <tr><td><strong>Referencia:</strong></td><td>${displayRef}</td></tr>
        <tr><td><strong>Tipo:</strong></td><td>${tipoLabel}</td></tr>
        <tr><td><strong>Monto:</strong></td><td>${monto}</td></tr>
        ${sol.tipo === 'compromiso' ? `<tr><td><strong>Fecha vencimiento:</strong></td><td>${fechaVenc}</td></tr>` : ''}
        <tr><td><strong>Medio de pago:</strong></td><td>${sol.medioPago}</td></tr>
        ${sol.bancoOrigen ? `<tr><td><strong>Banco origen:</strong></td><td>${sol.bancoOrigen}</td></tr>` : ''}
        ${sol.nota ? `<tr><td><strong>Nota:</strong></td><td>${sol.nota}</td></tr>` : ''}
      </table>
      <p style="margin-top:16px"><a href="${link}" style="background:#6366f1;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px">Revisar y aprobar</a></p>
    `;
    await Promise.all(recipients.map(r => this.emailService.sendEmail(r.email, subject, html)));
  }
}
