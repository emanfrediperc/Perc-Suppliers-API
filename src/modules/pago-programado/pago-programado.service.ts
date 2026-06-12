import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PagoProgramado, PagoProgramadoDocument } from './schemas/pago-programado.schema';
import { OrdenPagoService } from '../orden-pago/orden-pago.service';
import { CreatePagoProgramadoDto } from './dto/create-pago-programado.dto';
import { AprobacionService } from '../aprobacion/aprobacion.service';

@Injectable()
export class PagoProgramadoService {
  private readonly logger = new Logger(PagoProgramadoService.name);

  // Solo el cron ejecuta pagos en este estado. 'esperando_aprobacion' NO es
  // ejecutable: el desembolso real (pagar() -> Pago confirmado) requiere haber
  // pasado por el gate de aprobacion, igual que orden-pago y pago.
  private static readonly ESTADO_EJECUTABLE = 'programado';

  constructor(
    @InjectModel(PagoProgramado.name) private model: Model<PagoProgramadoDocument>,
    @InjectConnection() private connection: Connection,
    private ordenPagoService: OrdenPagoService,
    private readonly aprobacionService: AprobacionService,
  ) {}

  async create(
    dto: CreatePagoProgramadoDto,
    currentUser?: { userId: string; email: string },
  ) {
    // Gate de aprobacion: un pago programado dispara un desembolso real via el
    // cron, asi que NO puede crearse "listo para ejecutar". Nace en
    // 'esperando_aprobacion' y se crea la solicitud de aprobacion de forma
    // atomica (mismo patron que OrdenPagoService.create / PagoService.create).
    // Si no hay aprobadores activos, createAprobacion lanza y la transaccion aborta.
    const session = await this.connection.startSession();
    try {
      let created: PagoProgramadoDocument;
      await session.withTransaction(async () => {
        [created] = await this.model.create(
          [{ ...dto, estado: 'esperando_aprobacion', createdByEmail: currentUser?.email }],
          { session },
        );

        await this.aprobacionService.createAprobacion({
          entidad: 'pagos-programados',
          entidadId: created!._id.toString(),
          tipo: 'creacion',
          monto: dto.montoBase,
          descripcion: `Pago programado por ${new Intl.NumberFormat('es-AR').format(dto.montoBase)} ARS (${dto.medioPago})`,
          createdBy: currentUser?.userId ?? '',
          createdByEmail: currentUser?.email ?? '',
          datosOperacion: { ...dto },
        });
      });
      return created!;
    } finally {
      await session.endSession();
    }
  }

  async findAll(query: { estado?: string; page?: number; limit?: number } = {}) {
    const { estado, page = 1, limit = 20 } = query;
    const filter: any = {};
    if (estado) filter.estado = estado;
    const [data, total] = await Promise.all([
      this.model.find(filter)
        .populate({ path: 'ordenPago', populate: { path: 'empresaProveedora' } })
        .populate('pagoGenerado')
        .sort({ fechaProgramada: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      this.model.countDocuments(filter),
    ]);
    return { data, total, page, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const pp = await this.model.findById(id)
      .populate({ path: 'ordenPago', populate: { path: 'empresaProveedora' } })
      .populate('pagoGenerado');
    if (!pp) throw new NotFoundException('Pago programado no encontrado');
    return pp;
  }

  async cancelar(id: string, user?: { role?: string }) {
    const pp = await this.model.findById(id);
    if (!pp) throw new NotFoundException('Pago programado no encontrado');
    // Least-privilege (N3): 'cancelar' es un cambio de estado, competencia de
    // operador/admin. tesoreria NO cambia estados de operaciones ya aprobadas;
    // solo puede RETIRAR su propia solicitud mientras sigue 'esperando_aprobacion'.
    if (user?.role === 'tesoreria' && pp.estado !== 'esperando_aprobacion') {
      throw new ForbiddenException(
        'tesoreria solo puede cancelar pagos programados en espera de aprobacion (retirar la solicitud); cancelar uno ya aprobado es competencia de operador',
      );
    }
    // Cancelable mientras no se haya desembolsado: tanto 'programado' (aprobado y
    // pendiente de ejecucion) como 'esperando_aprobacion' (el creador retira la solicitud).
    const CANCELABLES = ['programado', 'esperando_aprobacion'];
    if (!CANCELABLES.includes(pp.estado)) {
      throw new BadRequestException(
        `Solo se pueden cancelar pagos programados o en espera de aprobacion (estado actual: "${pp.estado}")`,
      );
    }
    pp.estado = 'cancelado';
    await pp.save();
    return pp;
  }

  async getProximos(dias: number = 7) {
    const desde = new Date();
    const hasta = new Date();
    hasta.setDate(hasta.getDate() + dias);
    return this.model.find({
      estado: 'programado',
      fechaProgramada: { $gte: desde, $lte: hasta },
    })
      .populate({ path: 'ordenPago', populate: { path: 'empresaProveedora' } })
      .sort({ fechaProgramada: 1 });
  }

  @Cron(CronExpression.EVERY_HOUR)
  async ejecutarPagosProgramados() {
    const ahora = new Date();
    // Solo se ejecutan los que pasaron el gate de aprobacion (estado 'programado').
    // Los 'esperando_aprobacion' / 'rechazado' nunca se desembolsan por el cron.
    const pendientes = await this.model.find({
      estado: PagoProgramadoService.ESTADO_EJECUTABLE,
      fechaProgramada: { $lte: ahora },
    });

    for (const pp of pendientes) {
      try {
        const pago = await this.ordenPagoService.pagar(pp.ordenPago.toString(), {
          montoBase: pp.montoBase,
          medioPago: pp.medioPago,
          fechaPago: pp.fechaProgramada.toISOString(),
          retencionIIBB: pp.retencionIIBB,
          retencionGanancias: pp.retencionGanancias,
          retencionIVA: pp.retencionIVA,
          retencionSUSS: pp.retencionSUSS,
          otrasRetenciones: pp.otrasRetenciones,
          referenciaPago: pp.referenciaPago,
          observaciones: pp.observaciones ? `[Pago Programado] ${pp.observaciones}` : '[Pago Programado]',
        });
        pp.estado = 'ejecutado';
        pp.pagoGenerado = (pago as any)._id;
        await pp.save();
        this.logger.log(`Pago programado ${pp._id} ejecutado exitosamente`);
      } catch (error: any) {
        pp.estado = 'fallido';
        pp.errorMensaje = error.message || 'Error desconocido';
        await pp.save();
        this.logger.error(`Pago programado ${pp._id} falló: ${error.message}`);
      }
    }
  }
}
