import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FacturaDocument = Factura & Document;

@Schema({ timestamps: true, collection: 'facturas' })
export class Factura {
  @Prop({ required: true })
  numero: string;

  @Prop()
  finnegansId: string;

  @Prop({ required: true, enum: ['A', 'B', 'C', 'M', 'E', 'NC-A', 'NC-B', 'NC-C', 'ND-A', 'ND-B', 'ND-C'] })
  tipo: string;

  @Prop({ required: true })
  fecha: Date;

  @Prop()
  fechaVencimiento: Date;

  @Prop({ required: true })
  montoNeto: number;

  @Prop({ default: 0 })
  montoIva: number;

  @Prop({ required: true })
  montoTotal: number;

  @Prop({ default: 'ARS' })
  moneda: string;

  @Prop({ type: Types.ObjectId, ref: 'EmpresaProveedora' })
  empresaProveedora: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'EmpresaCliente', required: true })
  empresaCliente: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'OrdenPago' })
  ordenPago: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Factura' })
  facturaRelacionada: Types.ObjectId;

  @Prop({ default: 'pendiente', enum: ['pendiente', 'parcial', 'pagada', 'anulada'] })
  estado: string;

  @Prop({ default: 0 })
  montoPagado: number;

  @Prop()
  saldoPendiente: number;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Pago' }] })
  pagos: Types.ObjectId[];

  @Prop()
  archivoUrl: string;

  @Prop()
  archivoKey: string;

  @Prop()
  archivoNombre: string;

  @Prop({ default: true })
  activo: boolean;

  @Prop({
    type: [{
      tipo: { type: String, required: true },
      severidad: { type: String, enum: ['info', 'warning', 'error'], default: 'warning' },
      mensaje: { type: String, required: true },
      detalle: { type: Object },
      fecha: { type: Date, default: Date.now },
    }],
    default: [],
  })
  alertas: { tipo: string; severidad: 'info' | 'warning' | 'error'; mensaje: string; detalle?: any; fecha: Date }[];
}

export const FacturaSchema = SchemaFactory.createForClass(Factura);

FacturaSchema.index({ empresaProveedora: 1, estado: 1 });
FacturaSchema.index({ estado: 1, fechaVencimiento: 1 });
FacturaSchema.index({ fecha: -1 });
FacturaSchema.index({ numero: 1, empresaProveedora: 1 });
