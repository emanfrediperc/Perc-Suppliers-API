import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AuditLogDocument = AuditLog & Document;

@Schema({ timestamps: true, collection: 'audit_logs' })
export class AuditLog {
  @Prop({ required: true })
  usuario: string;

  @Prop({ required: true })
  usuarioEmail: string;

  @Prop({
    required: true,
    enum: [
      'crear', 'editar', 'eliminar',
      'pagar', 'anular', 'cancelar', 'renovar',
      'aprobar', 'rechazar',
      'login', 'sync',
      'token-emitido', 'token-emitido-reenvio',
      'decidir-via-token',
      'aprobacion-reenviada', 'rechazo-terminal',
    ],
  })
  accion: string;

  @Prop({ required: true })
  entidad: string;

  @Prop()
  entidadId: string;

  @Prop({ type: Object })
  cambios: Record<string, any>;

  @Prop()
  ip: string;

  @Prop()
  descripcion: string;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ entidad: 1, entidadId: 1 });
AuditLogSchema.index({ usuario: 1 });
AuditLogSchema.index({ createdAt: -1 });
