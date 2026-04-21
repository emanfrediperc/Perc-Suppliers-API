import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OnEvent } from '@nestjs/event-emitter';
import {
  CompraMonedaExtranjera,
  CompraMonedaExtranjeraDocument,
} from './schemas/compra-moneda-extranjera.schema';
import { EstadoCompraMonedaExtranjera } from './enums/estado-compra.enum';
import {
  APROBACION_RESUELTA,
  AprobacionResueltaEvent,
} from '../aprobacion/events/aprobacion-resuelta.event';

@Injectable()
export class CompraMonedaExtranjeraAprobacionListener {
  constructor(
    @InjectModel(CompraMonedaExtranjera.name)
    private model: Model<CompraMonedaExtranjeraDocument>,
  ) {}

  @OnEvent(APROBACION_RESUELTA)
  async handle(event: AprobacionResueltaEvent): Promise<void> {
    // Idempotencia: ignorar eventos de otras entidades
    if (event.entidad !== 'compras-fx') return;

    const compra = await this.model.findById(event.entidadId);
    if (!compra) return; // idempotencia: ya eliminada
    if (compra.estado !== EstadoCompraMonedaExtranjera.ESPERANDO_APROBACION) return; // ya transitó

    if (event.estado === 'aprobada') {
      // Estado activo tras aprobación — SOLICITADA es el estado operativo normal
      compra.estado = EstadoCompraMonedaExtranjera.SOLICITADA;
    } else {
      compra.estado = EstadoCompraMonedaExtranjera.ANULADA;
    }

    await compra.save();
  }
}
