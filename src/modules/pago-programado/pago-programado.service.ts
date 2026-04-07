import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PagoProgramado, PagoProgramadoDocument } from './schemas/pago-programado.schema';
import { OrdenPagoService } from '../orden-pago/orden-pago.service';
import { CreatePagoProgramadoDto } from './dto/create-pago-programado.dto';

@Injectable()
export class PagoProgramadoService {
  private readonly logger = new Logger(PagoProgramadoService.name);

  constructor(
    @InjectModel(PagoProgramado.name) private model: Model<PagoProgramadoDocument>,
    private ordenPagoService: OrdenPagoService,
  ) {}

  async create(dto: CreatePagoProgramadoDto, userEmail?: string) {
    return this.model.create({ ...dto, createdByEmail: userEmail });
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

  async cancelar(id: string) {
    const pp = await this.model.findById(id);
    if (!pp) throw new NotFoundException('Pago programado no encontrado');
    if (pp.estado !== 'programado') throw new NotFoundException('Solo se pueden cancelar pagos programados');
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
    const pendientes = await this.model.find({
      estado: 'programado',
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
