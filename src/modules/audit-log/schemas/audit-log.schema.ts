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
      'ejecutar', 'procesar', 'reagendar', 'revertir',
      'apocrifo-override',
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

  // Hash encadenado por (entidad, entidadId): sha256(prevHash + canonical(entry))
  // Permite detectar tampering en el audit log de cualquier entidad.
  // Es best-effort: el log() es no-bloqueante, así que si falla el hash no rompe la operación.
  @Prop()
  hash?: string;

  @Prop()
  prevHash?: string;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ entidad: 1, entidadId: 1 });
AuditLogSchema.index({ usuario: 1 });
AuditLogSchema.index({ createdAt: -1 });
