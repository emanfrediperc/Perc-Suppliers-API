import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AprobacionDocument = Aprobacion & Document;

@Schema({ _id: false })
export class DecisionAprobador {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  nombre: string;

  @Prop({ required: true })
  email: string;

  @Prop({ enum: ['pendiente', 'aprobada', 'rechazada'], default: 'pendiente' })
  decision: string;

  @Prop()
  comentario: string;

  @Prop()
  fecha: Date;
}

const DecisionAprobadorSchema = SchemaFactory.createForClass(DecisionAprobador);

/**
 * Snapshot de un ciclo de aprobación completado.
 * Se archiva en `intentos[]` cuando se reenvía una aprobación rechazada.
 */
@Schema({ _id: false })
export class IntentoAprobacion {
  @Prop({ required: true })
  numero: number;

  /** Snapshot de los aprobadores al cierre del ciclo. */
  @Prop({ type: [DecisionAprobadorSchema], default: [] })
  aprobadores: DecisionAprobador[];

  @Prop({ required: true, enum: ['aprobada', 'rechazada', 'pendiente'] })
  estadoFinal: string;

  @Prop({ required: true })
  fechaInicio: Date;

  @Prop()
  fechaFin: Date;
}

const IntentoAprobacionSchema = SchemaFactory.createForClass(IntentoAprobacion);

@Schema({ timestamps: true, collection: 'aprobaciones' })
export class Aprobacion {
  @Prop({ required: true, enum: ['ordenes-pago', 'pagos', 'prestamos', 'compras-fx'] })
  entidad: string;

  @Prop({ required: true })
  entidadId: string;

  @Prop({ required: true, enum: ['pago', 'anulacion', 'creacion'] })
  tipo: string;

  @Prop({ required: true, enum: ['pendiente', 'aprobada', 'rechazada'], default: 'pendiente' })
  estado: string;

  @Prop({ type: [DecisionAprobadorSchema], default: [] })
  aprobadores: DecisionAprobador[];

  @Prop({ required: true })
  aprobacionesRequeridas: number;

  @Prop({ required: true })
  monto: number;

  @Prop()
  descripcion: string;

  @Prop({ required: true })
  createdBy: string;

  @Prop({ required: true })
  createdByEmail: string;

  @Prop({ type: Object })
  datosOperacion: Record<string, any>;

  // ── Reenvío fields ──────────────────────────────────────────────────────────

  /** Historial de ciclos de aprobación cerrados (snapshot al momento de reenvío). */
  @Prop({ type: [IntentoAprobacionSchema], default: [] })
  intentos: IntentoAprobacion[];

  /** Cantidad de reenvíos restantes. Por defecto 1 (un solo reenvío habilitado). */
  @Prop({ default: 1 })
  reenviosRestantes: number;

  /** Fecha en que se realizó el último reenvío. */
  @Prop({ type: Date })
  fechaReenvio: Date;

  /** UserId de quien ejecutó el reenvío. */
  @Prop()
  reenviadoPor: string;
}

export const AprobacionSchema = SchemaFactory.createForClass(Aprobacion);
AprobacionSchema.index({ estado: 1, createdAt: -1 });
AprobacionSchema.index({ entidad: 1, entidadId: 1 });
