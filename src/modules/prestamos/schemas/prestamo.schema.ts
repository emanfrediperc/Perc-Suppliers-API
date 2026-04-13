import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Currency } from '../enums/currency.enum';
import { Vehicle } from '../enums/vehicle.enum';
import { PrestamoStatus } from '../enums/prestamo-status.enum';
import { BalanceCut } from '../enums/balance-cut.enum';
import { EmpresaKind } from '../enums/empresa-kind.enum';

@Schema({ _id: false })
export class EmpresaRef {
  @Prop({ type: Types.ObjectId, required: true })
  empresaId: Types.ObjectId;

  @Prop({ type: String, enum: EmpresaKind, required: true })
  empresaKind: EmpresaKind;

  @Prop({ required: true })
  razonSocialCache: string;
}

export const EmpresaRefSchema = SchemaFactory.createForClass(EmpresaRef);

export type PrestamoDocument = Prestamo & Document;

@Schema({ timestamps: true, collection: 'prestamos' })
export class Prestamo {
  @Prop({ type: EmpresaRefSchema, required: true })
  lender: EmpresaRef;

  @Prop({ type: EmpresaRefSchema, required: true })
  borrower: EmpresaRef;

  @Prop({ type: String, enum: Currency, required: true })
  currency: Currency;

  @Prop({ required: true, min: 1 })
  capital: number;

  @Prop({ required: true, min: 0 })
  rate: number;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  dueDate: Date;

  @Prop({ type: String, enum: Vehicle, required: true })
  vehicle: Vehicle;

  @Prop({ type: String, enum: PrestamoStatus, default: PrestamoStatus.ACTIVE })
  status: PrestamoStatus;

  @Prop({ type: String, enum: BalanceCut, required: true })
  balanceCut: BalanceCut;

  @Prop({ type: Types.ObjectId, ref: 'Prestamo', default: null })
  renewedFrom: Types.ObjectId | null;

  @Prop({
    type: [{ date: { type: Date }, action: { type: String }, detail: { type: String } }],
    default: [],
  })
  history: Array<{ date: Date; action: string; detail: string }>;
}

export const PrestamoSchema = SchemaFactory.createForClass(Prestamo);

PrestamoSchema.set('optimisticConcurrency', true);

PrestamoSchema.index({ status: 1 });
PrestamoSchema.index({ currency: 1, status: 1 });
PrestamoSchema.index({ 'lender.empresaId': 1 });
PrestamoSchema.index({ 'borrower.empresaId': 1 });
PrestamoSchema.index({ dueDate: 1 });
PrestamoSchema.index({ renewedFrom: 1 }, { sparse: true });
