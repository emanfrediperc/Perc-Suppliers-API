import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OnEvent } from '@nestjs/event-emitter';
import { OrdenPago, OrdenPagoDocument } from './schemas/orden-pago.schema';
import {
  APROBACION_RESUELTA,
  AprobacionResueltaEvent,
  APROBACION_REENVIADA,
  AprobacionReenviadaEvent,
} from '../aprobacion/events/aprobacion-resuelta.event';

@Injectable()
export class OrdenPagoAprobacionListener {
  constructor(
    @InjectModel(OrdenPago.name) private ordenModel: Model<OrdenPagoDocument>,
  ) {}

  @OnEvent(APROBACION_RESUELTA)
  async handle(event: AprobacionResueltaEvent): Promise<void> {
    // Idempotencia: ignorar eventos de otras entidades
    if (event.entidad !== 'ordenes-pago') return;

    const orden = await this.ordenModel.findById(event.entidadId);
    if (!orden) return; // idempotencia: ya eliminada
    if (orden.estado !== 'esperando_aprobacion') return; // ya transitó

    if (event.estado === 'aprobada') {
      // Estado activo tras aprobación — 'pendiente' es el estado operativo normal
      orden.estado = 'pendiente';
    } else {
      orden.estado = 'anulada';
    }

    await orden.save();
  }

  // T036 — Reenvío: transicionar anulada → esperando_aprobacion para el nuevo ciclo.
  // Idempotente: solo actúa si el estado actual es 'anulada'.
  @OnEvent(APROBACION_REENVIADA)
  async handleReenviada(event: AprobacionReenviadaEvent): Promise<void> {
    if (event.entidad !== 'ordenes-pago') return;

    const orden = await this.ordenModel.findById(event.entidadId);
    if (!orden) return;
    if (orden.estado !== 'anulada') return; // idempotencia

    orden.estado = 'esperando_aprobacion';
    await orden.save();
  }
}
