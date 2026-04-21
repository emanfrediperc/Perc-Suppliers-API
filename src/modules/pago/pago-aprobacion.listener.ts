import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OnEvent } from '@nestjs/event-emitter';
import { Pago, PagoDocument } from './schemas/pago.schema';
import {
  APROBACION_RESUELTA,
  AprobacionResueltaEvent,
  APROBACION_REENVIADA,
  AprobacionReenviadaEvent,
} from '../aprobacion/events/aprobacion-resuelta.event';

@Injectable()
export class PagoAprobacionListener {
  constructor(
    @InjectModel(Pago.name) private pagoModel: Model<PagoDocument>,
  ) {}

  @OnEvent(APROBACION_RESUELTA)
  async handle(event: AprobacionResueltaEvent): Promise<void> {
    // Idempotencia: ignorar eventos de otras entidades
    if (event.entidad !== 'pagos') return;

    const pago = await this.pagoModel.findById(event.entidadId);
    if (!pago) return; // idempotencia: ya eliminado
    if (pago.estado !== 'esperando_aprobacion') return; // ya transitó

    if (event.estado === 'aprobada') {
      // Estado activo tras aprobación — 'pendiente' indica que el pago debe ejecutarse
      pago.estado = 'pendiente';
    } else {
      pago.estado = 'anulado';
    }

    await pago.save();
  }

  // T037 — Reenvío: transicionar anulado → esperando_aprobacion para el nuevo ciclo.
  // Idempotente: solo actúa si el estado actual es 'anulado'.
  @OnEvent(APROBACION_REENVIADA)
  async handleReenviada(event: AprobacionReenviadaEvent): Promise<void> {
    if (event.entidad !== 'pagos') return;

    const pago = await this.pagoModel.findById(event.entidadId);
    if (!pago) return;
    if (pago.estado !== 'anulado') return; // idempotencia

    pago.estado = 'esperando_aprobacion';
    await pago.save();
  }
}
