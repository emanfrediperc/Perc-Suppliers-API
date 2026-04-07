import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type EmpresaClienteDocument = EmpresaCliente & Document;

@Schema({ timestamps: true, collection: 'empresas_clientes' })
export class EmpresaCliente {
  @Prop({ required: true, unique: true })
  cuit: string;

  @Prop({ required: true })
  razonSocial: string;

  @Prop()
  nombreFantasia: string;

  @Prop()
  finnegansId: string;

  @Prop()
  condicionIva: string;

  @Prop()
  direccion: string;

  @Prop()
  telefono: string;

  @Prop()
  email: string;

  @Prop({ default: true })
  activa: boolean;
}

export const EmpresaClienteSchema = SchemaFactory.createForClass(EmpresaCliente);
