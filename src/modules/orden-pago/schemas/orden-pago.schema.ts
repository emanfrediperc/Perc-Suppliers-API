import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OrdenPagoDocument = OrdenPago & Document;

@Schema({ timestamps: true, collection: 'ordenes_pago' })
export class OrdenPago {
  @Prop({ required: true })
  numero: string;

  @Prop()
  finnegansId: string;

  @Prop({ required: true })
  fecha: Date;

  @Prop({ type: Types.ObjectId, ref: 'EmpresaProveedora' })
  empresaProveedora: Types.ObjectId;

  @Prop({ required: true })
  montoTotal: number;

  @Prop({ default: 'ARS' })
  moneda: string;

  @Prop({ default: 'pendiente', enum: ['pendiente', 'parcial', 'pagada', 'anulada'] })
  estado: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Factura' }] })
  facturas: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Pago' }] })
  pagos: Types.ObjectId[];

  @Prop({ default: 0 })
  montoPagado: number;

  @Prop({ default: 0 })
  saldoPendiente: number;

  @Prop({ default: true })
  activo: boolean;
}

export const OrdenPagoSchema = SchemaFactory.createForClass(OrdenPago);

OrdenPagoSchema.index({ empresaProveedora: 1, estado: 1 });
OrdenPagoSchema.index({ estado: 1, fecha: -1 });
