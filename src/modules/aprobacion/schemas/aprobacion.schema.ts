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

@Schema({ timestamps: true, collection: 'aprobaciones' })
export class Aprobacion {
  @Prop({ required: true, enum: ['ordenes-pago', 'facturas', 'pagos'] })
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
}

export const AprobacionSchema = SchemaFactory.createForClass(Aprobacion);
AprobacionSchema.index({ estado: 1, createdAt: -1 });
AprobacionSchema.index({ entidad: 1, entidadId: 1 });
