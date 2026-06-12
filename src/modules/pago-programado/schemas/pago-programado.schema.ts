import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PagoProgramadoDocument = PagoProgramado & Document;

@Schema({ timestamps: true, collection: 'pagos-programados' })
export class PagoProgramado {
  @Prop({ type: Types.ObjectId, ref: 'OrdenPago', required: true })
  ordenPago: Types.ObjectId;

  @Prop({ required: true })
  montoBase: number;

  @Prop({ required: true, enum: ['transferencia', 'cheque', 'efectivo', 'compensacion', 'otro'] })
  medioPago: string;

  @Prop({ required: true })
  fechaProgramada: Date;

  @Prop({ default: 0 })
  retencionIIBB: number;

  @Prop({ default: 0 })
  retencionGanancias: number;

  @Prop({ default: 0 })
  retencionIVA: number;

  @Prop({ default: 0 })
  retencionSUSS: number;

  @Prop({ default: 0 })
  otrasRetenciones: number;

  @Prop()
  referenciaPago: string;

  @Prop()
  observaciones: string;

  // 'esperando_aprobacion' es el estado inicial: el pago programado NO es
  // ejecutable por el cron hasta que el flujo de aprobacion lo transicione a
  // 'programado'. 'rechazado' es el estado terminal cuando el aprobador lo niega.
  @Prop({
    default: 'esperando_aprobacion',
    enum: ['esperando_aprobacion', 'programado', 'ejecutado', 'cancelado', 'fallido', 'rechazado'],
  })
  estado: string;

  @Prop()
  errorMensaje: string;

  @Prop({ type: Types.ObjectId, ref: 'Pago' })
  pagoGenerado: Types.ObjectId;

  @Prop()
  createdByEmail: string;
}

export const PagoProgramadoSchema = SchemaFactory.createForClass(PagoProgramado);
PagoProgramadoSchema.index({ estado: 1, fechaProgramada: 1 });
