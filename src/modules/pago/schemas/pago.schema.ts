import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PagoDocument = Pago & Document;

@Schema({ timestamps: true, collection: 'pagos' })
export class Pago {
  @Prop({ type: Types.ObjectId, ref: 'OrdenPago' })
  ordenPago: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Factura' })
  factura: Types.ObjectId;

  @Prop({ required: true })
  fechaPago: Date;

  @Prop({ required: true })
  montoBase: number;

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

  @Prop({ default: 0 })
  comision: number;

  @Prop({ default: 0 })
  porcentajeComision: number;

  @Prop({ default: 0 })
  descuento: number;

  @Prop({ default: 0 })
  porcentajeDescuento: number;

  @Prop({ required: true })
  montoNeto: number;

  @Prop({ required: true, enum: ['transferencia', 'cheque', 'efectivo', 'compensacion', 'otro'] })
  medioPago: string;

  @Prop()
  referenciaPago: string;

  @Prop()
  observaciones: string;

  @Prop({ type: Types.ObjectId, ref: 'Convenio' })
  convenioAplicado: Types.ObjectId;

  // T017 — 'esperando_aprobacion' added for approval gate
  @Prop({ default: 'confirmado', enum: ['confirmado', 'pendiente', 'rechazado', 'anulado', 'esperando_aprobacion'] })
  estado: string;
}

export const PagoSchema = SchemaFactory.createForClass(Pago);

PagoSchema.index({ factura: 1 });
PagoSchema.index({ ordenPago: 1 });
PagoSchema.index({ estado: 1, fechaPago: -1 });
