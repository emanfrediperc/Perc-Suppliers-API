import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ConfiguracionDocument = Configuracion & Document;

@Schema({ timestamps: true, collection: 'configuraciones' })
export class Configuracion {
  @Prop({ required: true, unique: true })
  clave: string;

  @Prop({ type: Object, required: true })
  valor: Record<string, any>;

  @Prop()
  descripcion: string;
}

export const ConfiguracionSchema = SchemaFactory.createForClass(Configuracion);
