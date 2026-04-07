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

  @Prop({ default: 'programado', enum: ['programado', 'ejecutado', 'cancelado', 'fallido'] })
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
