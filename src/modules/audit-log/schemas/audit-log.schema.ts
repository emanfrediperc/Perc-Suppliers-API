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
      'crear',
      'editar',
      'eliminar',
      'pagar',
      'anular',
      'cancelar',
      'renovar',
      'aprobar',
      'rechazar',
      'login',
      'sync',
      'token-emitido',
      'token-emitido-reenvio',
      'decidir-via-token',
      'aprobacion-reenviada',
      'rechazo-terminal',
      'ejecutar',
      'procesar',
      'reagendar',
      'revertir',
      'apocrifo-override',
      'step-up-iniciado',
      'step-up-satisfecho',
      'step-up-fallido',
      'step-up-bloqueado',
      'totp-enrolado',
      'totp-revocado',
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
  userAgent: string;

  @Prop()
  descripcion: string;

  // Hash encadenado por (entidad, entidadId).
  // Con AUDIT_HMAC_KEY configurada: HMAC-SHA256(secreto, prevHash + canonical(entry)) — el secreto
  // vive fuera de la DB, así que un insider con write a `audit_logs` NO puede recomputar la cadena.
  // Sin la clave (sólo dev): SHA-256 plano (best-effort, NO resiste insiders).
  // El log() es no-bloqueante, así que si falla el hash no rompe la operación.
  @Prop()
  hash?: string;

  @Prop()
  prevHash?: string;

  // true => la entry fue sellada con HMAC (clave server-side). Se incluye en el canonical,
  // de modo que un insider no puede "downgradear" una entry firmada a SHA-256 plano sin
  // romper la cadena. Default false para entradas legacy (pre-HMAC).
  @Prop({ default: false })
  hmac?: boolean;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ entidad: 1, entidadId: 1 });
AuditLogSchema.index({ usuario: 1 });
AuditLogSchema.index({ createdAt: -1 });
