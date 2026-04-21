import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OnEvent } from '@nestjs/event-emitter';
import { Prestamo, PrestamoDocument } from './schemas/prestamo.schema';
import { PrestamoStatus } from './enums/prestamo-status.enum';
import {
  APROBACION_RESUELTA,
  AprobacionResueltaEvent,
  APROBACION_REENVIADA,
  AprobacionReenviadaEvent,
} from '../aprobacion/events/aprobacion-resuelta.event';

@Injectable()
export class PrestamosAprobacionListener {
  constructor(
    @InjectModel(Prestamo.name) private prestamoModel: Model<PrestamoDocument>,
  ) {}

  @OnEvent(APROBACION_RESUELTA)
  async handle(event: AprobacionResueltaEvent): Promise<void> {
    // Idempotencia: ignorar eventos de otras entidades
    if (event.entidad !== 'prestamos') return;

    const prestamo = await this.prestamoModel.findById(event.entidadId);
    if (!prestamo) return; // idempotencia: ya eliminado
    if (prestamo.status !== PrestamoStatus.ESPERANDO_APROBACION) return; // ya transitó

    if (event.estado === 'aprobada') {
      // Estado activo tras aprobación — mismo estado que la creación anterior tenía
      prestamo.status = PrestamoStatus.ACTIVE;
      prestamo.history.push({
        date: new Date(),
        action: 'Aprobado',
        detail: `Aprobación concedida (aprobacionId: ${event.aprobacionId})`,
      });
    } else {
      prestamo.status = PrestamoStatus.ANULADO;
      prestamo.history.push({
        date: new Date(),
        action: 'Rechazado',
        detail: `Aprobación rechazada (aprobacionId: ${event.aprobacionId})`,
      });
    }

    await prestamo.save();
  }

  // T034 — Reenvío: transicionar ANULADO → ESPERANDO_APROBACION para que el aprobador
  // pueda votar sobre el nuevo ciclo. Idempotente: solo actúa si el estado es ANULADO.
  @OnEvent(APROBACION_REENVIADA)
  async handleReenviada(event: AprobacionReenviadaEvent): Promise<void> {
    if (event.entidad !== 'prestamos') return;

    const prestamo = await this.prestamoModel.findById(event.entidadId);
    if (!prestamo) return;
    if (prestamo.status !== PrestamoStatus.ANULADO) return; // idempotencia: solo desde rechazado

    prestamo.status = PrestamoStatus.ESPERANDO_APROBACION;
    prestamo.history.push({
      date: new Date(),
      action: 'Reenviado',
      detail: `Solicitud reenviada para nueva aprobación (aprobacionId: ${event.aprobacionId})`,
    });
    await prestamo.save();
  }
}
