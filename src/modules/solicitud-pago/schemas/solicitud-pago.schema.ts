import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SolicitudPagoDocument = SolicitudPago & Document;

export const ESTADOS_SOLICITUD = [
  'pendiente',
  'en_proceso',
  'pago_en_proceso_perc',
  'procesado',
  'cancelado',
] as const;
export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number];

export const TIPOS_SOLICITUD = ['manual', 'compromiso'] as const;
export type TipoSolicitud = (typeof TIPOS_SOLICITUD)[number];

export const TIPOS_COMPROBANTE = ['perc', 'retenciones'] as const;
export type TipoComprobante = (typeof TIPOS_COMPROBANTE)[number];

export const MEDIOS_PAGO = ['transferencia', 'cheque', 'efectivo', 'compensacion', 'otro'] as const;
export type MedioPago = (typeof MEDIOS_PAGO)[number];

@Schema({ _id: false })
class AuditUser {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) user: Types.ObjectId;
  @Prop({ required: true }) fecha: Date;
  @Prop() motivo?: string;
}
const AuditUserSchema = SchemaFactory.createForClass(AuditUser);

@Schema({ _id: false })
class Comprobante {
  @Prop({ required: true, enum: TIPOS_COMPROBANTE }) tipo: TipoComprobante;
  @Prop({ required: true }) url: string;
  @Prop({ required: true }) key: string;
  @Prop({ required: true }) nombre: string;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) subidoPor: Types.ObjectId;
  @Prop({ required: true }) fecha: Date;
}
const ComprobanteSchema = SchemaFactory.createForClass(Comprobante);

@Schema({ _id: false })
class HistorialEntry {
  @Prop({ required: true }) accion: string;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) usuario: Types.ObjectId;
  @Prop() motivo?: string;
  @Prop() estadoAnterior?: string;
  @Prop() estadoNuevo?: string;
  @Prop() fechaAnterior?: Date;
  @Prop() fechaNueva?: Date;
  @Prop({ required: true }) fecha: Date;
}
const HistorialEntrySchema = SchemaFactory.createForClass(HistorialEntry);

@Schema({ timestamps: true, collection: 'solicitudes_pago' })
export class SolicitudPago {
  @Prop({ type: Types.ObjectId, ref: 'Factura', required: true, index: true })
  factura: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'EmpresaProveedora', required: true, index: true })
  empresaProveedora: Types.ObjectId;

  @Prop({ required: true, enum: TIPOS_SOLICITUD })
  tipo: TipoSolicitud;

  @Prop({ required: true })
  monto: number;

  @Prop()
  fechaVencimiento?: Date;

  @Prop()
  nota?: string;

  @Prop({ required: true, enum: MEDIOS_PAGO })
  medioPago: MedioPago;

  @Prop()
  bancoOrigen?: string;

  @Prop({ required: true, enum: ESTADOS_SOLICITUD, default: 'pendiente', index: true })
  estado: EstadoSolicitud;

  @Prop({ type: AuditUserSchema, required: true })
  createdBy: AuditUser;

  @Prop({ type: AuditUserSchema })
  aprobadoPor?: AuditUser;

  @Prop({ type: AuditUserSchema })
  ejecutadoPor?: AuditUser;

  @Prop({ type: AuditUserSchema })
  procesadoPor?: AuditUser;

  @Prop({ type: AuditUserSchema })
  canceladoPor?: AuditUser;

  @Prop({ type: [ComprobanteSchema], default: [] })
  comprobantes: Comprobante[];

  @Prop({ type: [HistorialEntrySchema], default: [] })
  historial: HistorialEntry[];

  @Prop({ default: 0 })
  reagendadoVeces: number;

  @Prop({ type: Types.ObjectId, ref: 'Pago' })
  pagoGenerado?: Types.ObjectId;
}

export const SolicitudPagoSchema = SchemaFactory.createForClass(SolicitudPago);
SolicitudPagoSchema.index({ estado: 1, fechaVencimiento: 1 });
SolicitudPagoSchema.index({ factura: 1, estado: 1 });
