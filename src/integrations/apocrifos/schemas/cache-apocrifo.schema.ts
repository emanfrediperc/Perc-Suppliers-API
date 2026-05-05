import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CacheApocrifoDocument = CacheApocrifo & Document;

@Schema({ timestamps: true, collection: 'cache_apocrifos' })
export class CacheApocrifo {
  @Prop({ required: true, unique: true, index: true })
  cuit: string;

  @Prop({ required: true })
  esApocrifo: boolean;

  @Prop({ type: Array, default: [] })
  matches: { cuit: string; fechaDeteccion: string | null; fechaPublicacion: string | null; descripcion: string }[];

  @Prop({ required: true })
  expiraEn: Date;
}

export const CacheApocrifoSchema = SchemaFactory.createForClass(CacheApocrifo);
CacheApocrifoSchema.index({ expiraEn: 1 }, { expireAfterSeconds: 0 });
