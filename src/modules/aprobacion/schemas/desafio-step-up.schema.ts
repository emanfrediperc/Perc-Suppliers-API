import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DesafioStepUpDocument = DesafioStepUp & Document;

/**
 * Desafío de segundo factor (step-up) ligado a una aprobación y aprobador concretos.
 * Espeja el diseño de AprobacionToken: secretos/proofs guardados sólo como hash,
 * single-use, TTL-cleaned, scoped a (aprobacionId, userId) — la identidad se deriva
 * del magic-link token, nunca del request.
 */
@Schema({ timestamps: true, collection: 'desafios_step_up' })
export class DesafioStepUp {
  @Prop({ type: Types.ObjectId, required: true })
  aprobacionId: Types.ObjectId;

  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  userEmail: string;

  @Prop({ required: true, enum: ['password', 'totp'] })
  factorRequerido: string;

  @Prop({ default: false })
  satisfecho: boolean;

  @Prop({ type: String, default: null })
  factorUsado: string | null;

  @Prop({ default: 0 })
  intentosFallidos: number;

  @Prop({ type: Date, default: null })
  bloqueadoHasta: Date | null;

  /** SHA256 del proof emitido al satisfacer el factor (el raw vive sólo en la respuesta). */
  @Prop({ type: String, default: null })
  proofHash: string | null;

  /** Single-use: el proof no puede reutilizarse para decidir dos veces. */
  @Prop({ default: false })
  proofUsado: boolean;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ type: String, default: null })
  ip: string | null;

  @Prop({ type: String, default: null })
  userAgent: string | null;
}

export const DesafioStepUpSchema = SchemaFactory.createForClass(DesafioStepUp);
DesafioStepUpSchema.index({ aprobacionId: 1, userId: 1 });
DesafioStepUpSchema.index({ proofHash: 1 }, { unique: true, sparse: true });
// TTL: limpia desafíos vencidos automáticamente.
DesafioStepUpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
