import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OnEvent } from '@nestjs/event-emitter';
import { PagoProgramado, PagoProgramadoDocument } from './schemas/pago-programado.schema';
import {
  APROBACION_RESUELTA,
  APROBACION_REENVIADA,
  type AprobacionResueltaEvent,
  type AprobacionReenviadaEvent,
} from '../aprobacion/events/aprobacion-resuelta.event';

/**
 * Transiciona un PagoProgramado segun la decision del flujo de aprobacion.
 * Mientras esta en 'esperando_aprobacion' el cron NO lo ejecuta; solo tras la
 * aprobacion pasa a 'programado' (ejecutable). Esto cierra el bypass del gate
 * por el que el cron emitia un Pago real sin pasar por aprobacion.
 *
 * Nota: el campo `entidad` del evento esta tipado como union cerrada en el modulo
 * aprobacion (no incluye 'pagos-programados'); comparamos por string para no
 * tocar archivos de otro modulo. El valor en runtime es el que se paso a
 * createAprobacion (verificado: aprobacion.service.ts castea el string almacenado).
 */
@Injectable()
export class PagoProgramadoAprobacionListener {
  constructor(
    @InjectModel(PagoProgramado.name) private model: Model<PagoProgramadoDocument>,
  ) {}

  @OnEvent(APROBACION_RESUELTA)
  async handle(event: AprobacionResueltaEvent): Promise<void> {
    if ((event.entidad as string) !== 'pagos-programados') return;

    const pp = await this.model.findById(event.entidadId);
    if (!pp) return; // idempotencia: ya eliminado
    if (pp.estado !== 'esperando_aprobacion') return; // ya transitó

    pp.estado = event.estado === 'aprobada' ? 'programado' : 'rechazado';
    await pp.save();
  }

  @OnEvent(APROBACION_REENVIADA)
  async handleReenviada(event: AprobacionReenviadaEvent): Promise<void> {
    if ((event.entidad as string) !== 'pagos-programados') return;

    const pp = await this.model.findById(event.entidadId);
    if (!pp) return;
    if (pp.estado !== 'rechazado') return; // idempotencia

    pp.estado = 'esperando_aprobacion';
    await pp.save();
  }
}
