import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export const VALID_ROLES = [
  'admin',
  'tesoreria',
  'operador',
  'consulta',
  'aprobador',
  'contabilidad',
] as const;
export type UserRole = (typeof VALID_ROLES)[number];

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ required: true })
  nombre: string;

  @Prop()
  apellido: string;

  @Prop({ default: 'consulta', enum: VALID_ROLES })
  role: string;

  @Prop({ default: true })
  activo: boolean;

  @Prop({ default: 0 })
  failedLoginAttempts: number;

  @Prop({ type: Date, default: null })
  lockUntil: Date | null;

  @Prop({ default: 0 })
  tokenVersion: number;

  @Prop({ default: false })
  mustChangePassword: boolean;

  // ── Step-up / TOTP (segundo factor para aprobaciones de monto alto) ──────────

  /** Secreto TOTP cifrado en reposo (AES-256-GCM). null = no enrolado. */
  @Prop({ type: String, default: null })
  totpSecretCifrado: string | null;

  /**
   * Secreto provisional durante el enrolamiento (cifrado). Se promueve a
   * totpSecretCifrado SÓLO al confirmar. Mantenerlo separado evita que iniciar
   * un enrolamiento destruya un 2FA ya activo.
   */
  @Prop({ type: String, default: null })
  totpSecretProvisional: string | null;

  /** TOTP enrolado y confirmado (listo para usar como segundo factor). */
  @Prop({ default: false })
  totpHabilitado: boolean;

  @Prop({ type: Date, default: null })
  totpActivadoEn: Date | null;

  /** Códigos de recuperación de un solo uso (bcrypt-hasheados). */
  @Prop({ type: [String], default: [] })
  codigosRecuperacion: string[];

  /** Lockout de step-up por usuario (espeja failedLoginAttempts/lockUntil del login). */
  @Prop({ default: 0 })
  stepUpIntentosFallidos: number;

  @Prop({ type: Date, default: null })
  stepUpBloqueadoHasta: Date | null;
}

export const UserSchema = SchemaFactory.createForClass(User);
