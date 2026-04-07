import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NotificacionDocument = Notificacion & Document;

@Schema({ timestamps: true, collection: 'notificaciones' })
export class Notificacion {
  @Prop({ required: true })
  usuario: string;

  @Prop({ required: true, enum: ['aprobacion_pendiente', 'pago_confirmado', 'pago_rechazado', 'factura_por_vencer', 'factura_vencida', 'orden_sincronizada', 'sistema'] })
  tipo: string;

  @Prop({ required: true })
  titulo: string;

  @Prop({ required: true })
  mensaje: string;

  @Prop()
  entidad: string;

  @Prop()
  entidadId: string;

  @Prop({ default: false })
  leida: boolean;

  @Prop()
  leidaAt: Date;
}

export const NotificacionSchema = SchemaFactory.createForClass(Notificacion);
NotificacionSchema.index({ usuario: 1, leida: 1, createdAt: -1 });
