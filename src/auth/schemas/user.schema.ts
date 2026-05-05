import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export const VALID_ROLES = ['admin', 'tesoreria', 'operador', 'consulta', 'aprobador', 'contabilidad'] as const;
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
}

export const UserSchema = SchemaFactory.createForClass(User);
