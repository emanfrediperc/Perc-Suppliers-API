import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ModalidadCompra } from '../enums/modalidad-compra.enum';
import { EstadoCompraMonedaExtranjera } from '../enums/estado-compra.enum';

@Schema({ _id: false })
export class EmpresaClienteRef {
  @Prop({ type: Types.ObjectId, required: true })
  empresaId: Types.ObjectId;

  @Prop({ required: true })
  razonSocialCache: string;
}

export const EmpresaClienteRefSchema = SchemaFactory.createForClass(EmpresaClienteRef);

export type CompraMonedaExtranjeraDocument = CompraMonedaExtranjera & Document;

@Schema({ timestamps: true, collection: 'compras_moneda_extranjera' })
export class CompraMonedaExtranjera {
  @Prop({ required: true })
  fecha: Date;

  @Prop({ type: String, enum: ModalidadCompra, required: true })
  modalidad: ModalidadCompra;

  @Prop({ type: EmpresaClienteRefSchema, required: true })
  empresaCliente: EmpresaClienteRef;

  @Prop({ required: true, min: 0.01 })
  montoUSD: number;

  @Prop({ required: true, min: 0.0001 })
  tipoCambio: number;

  @Prop({ required: true, min: 0 })
  montoARS: number;

  @Prop({ required: true })
  contraparte: string;

  @Prop({ default: 0, min: 0 })
  comision: number;

  @Prop()
  referencia?: string;

  @Prop({
    type: String,
    enum: EstadoCompraMonedaExtranjera,
    default: EstadoCompraMonedaExtranjera.CONFIRMADA,
  })
  estado: EstadoCompraMonedaExtranjera;

  @Prop()
  observaciones?: string;

  @Prop()
  motivoAnulacion?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  creadoPor: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  anuladoPor?: Types.ObjectId;

  @Prop()
  anuladoAt?: Date;
}

export const CompraMonedaExtranjeraSchema = SchemaFactory.createForClass(CompraMonedaExtranjera);

CompraMonedaExtranjeraSchema.set('optimisticConcurrency', true);

CompraMonedaExtranjeraSchema.index({ fecha: -1 });
CompraMonedaExtranjeraSchema.index({ modalidad: 1 });
CompraMonedaExtranjeraSchema.index({ 'empresaCliente.empresaId': 1 });
CompraMonedaExtranjeraSchema.index({ 'empresaCliente.empresaId': 1, fecha: -1 });
CompraMonedaExtranjeraSchema.index({ estado: 1 });
