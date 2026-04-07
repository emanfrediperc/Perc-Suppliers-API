import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ComentarioDocument = Comentario & Document;

@Schema({ timestamps: true, collection: 'comentarios' })
export class Comentario {
  @Prop({ required: true, enum: ['orden-pago', 'factura'] })
  entidad: string;

  @Prop({ required: true, type: Types.ObjectId })
  entidadId: Types.ObjectId;

  @Prop({ required: true })
  texto: string;

  @Prop({ required: true })
  autorEmail: string;

  @Prop({ required: true })
  autorNombre: string;
}

export const ComentarioSchema = SchemaFactory.createForClass(Comentario);
