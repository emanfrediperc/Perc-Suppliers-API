import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Moneda } from '../enums/moneda.enum';
import { EstadoCompraMonedaExtranjera } from '../enums/estado-compra.enum';

export type EmpresaKind = 'cliente' | 'proveedora';

@Schema({ _id: false })
export class EmpresaRef {
  @Prop({ type: Types.ObjectId, required: true })
  empresaId: Types.ObjectId;

  @Prop({ type: String, enum: ['cliente', 'proveedora'], required: true })
  empresaKind: EmpresaKind;

  @Prop({ required: true })
  razonSocialCache: string;
}

export const EmpresaRefSchema = SchemaFactory.createForClass(EmpresaRef);

export type CompraMonedaExtranjeraDocument = CompraMonedaExtranjera & Document;

@Schema({ timestamps: true, collection: 'compras_moneda_extranjera' })
export class CompraMonedaExtranjera {
  @Prop({ required: true })
  fechaSolicitada: Date;

  @Prop()
  fechaEstimadaEjecucion?: Date;

  @Prop()
  fechaEjecutada?: Date;

  @Prop({ type: String, enum: Moneda, required: true })
  monedaOrigen: Moneda;

  @Prop({ type: String, enum: Moneda, required: true })
  monedaDestino: Moneda;

  @Prop({ type: EmpresaRefSchema, required: true })
  empresa: EmpresaRef;

  @Prop({ required: true, min: 0.01 })
  montoOrigen: number;

  @Prop({ min: 0.0001 })
  tipoCambio?: number;

  @Prop({ min: 0 })
  montoDestino?: number;

  @Prop()
  contraparte?: string;

  @Prop({ default: 0, min: 0 })
  comision: number;

  @Prop()
  referencia?: string;

  @Prop({
    type: String,
    enum: EstadoCompraMonedaExtranjera,
    default: EstadoCompraMonedaExtranjera.SOLICITADA,
  })
  estado: EstadoCompraMonedaExtranjera;

  @Prop()
  observaciones?: string;

  @Prop()
  motivoAnulacion?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  creadoPor: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  ejecutadoPor?: Types.ObjectId;

  @Prop()
  ejecutadoAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  anuladoPor?: Types.ObjectId;

  @Prop()
  anuladoAt?: Date;
}

export const CompraMonedaExtranjeraSchema = SchemaFactory.createForClass(CompraMonedaExtranjera);

CompraMonedaExtranjeraSchema.set('optimisticConcurrency', true);

CompraMonedaExtranjeraSchema.index({ fechaSolicitada: -1 });
CompraMonedaExtranjeraSchema.index({ monedaOrigen: 1, monedaDestino: 1 });
CompraMonedaExtranjeraSchema.index({ 'empresa.empresaId': 1 });
CompraMonedaExtranjeraSchema.index({ 'empresa.empresaId': 1, fechaSolicitada: -1 });
CompraMonedaExtranjeraSchema.index({ estado: 1 });
