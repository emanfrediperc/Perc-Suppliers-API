import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AprobacionTokenDocument = AprobacionToken & Document;

@Schema({ timestamps: true, collection: 'aprobacion_tokens' })
export class AprobacionToken {
  /** ObjectId de la Aprobacion a la que pertenece este token. */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Aprobacion' })
  aprobacionId: Types.ObjectId;

  /** UserId del aprobador al que se emitió el token. */
  @Prop({ required: true })
  userId: string;

  /** Email del aprobador — desnormalizado para auditoría y queries rápidas. */
  @Prop({ required: true })
  userEmail: string;

  /**
   * sha256 hex (64 chars) del token crudo.
   * El token crudo vive ÚNICAMENTE en el link del email — nunca en la DB.
   */
  @Prop({ required: true, unique: true })
  tokenHash: string;

  /**
   * Fecha/hora de expiración.
   * La lógica de aplicación valida en código; el índice TTL de MongoDB limpia
   * documentos expirados automáticamente (~60s de delay).
   */
  @Prop({ required: true })
  expiresAt: Date;

  /** true una vez que el token fue utilizado para tomar una decisión. */
  @Prop({ default: false })
  usado: boolean;

  /** Fecha en que fue consumido. */
  @Prop({ type: Date, default: null })
  usadoEn: Date | null;

  /** IP desde la que se consumió el token. */
  @Prop({ type: String, default: null })
  ip: string | null;

  /** User-Agent del cliente que consumió el token. */
  @Prop({ type: String, default: null })
  userAgent: string | null;
}

export const AprobacionTokenSchema = SchemaFactory.createForClass(AprobacionToken);

// El índice único sobre tokenHash ya lo crea @Prop({ unique: true }) arriba.
// No se declara acá para evitar el warning "Duplicate schema index".

// Para invalidar tokens hermanos de un mismo aprobador en una aprobación.
AprobacionTokenSchema.index({ aprobacionId: 1, userId: 1 });

// TTL index: MongoDB elimina los documentos ~60s después de que expiresAt haya pasado.
// NO reemplaza la validación en código — solo previene crecimiento ilimitado de la colección.
AprobacionTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
