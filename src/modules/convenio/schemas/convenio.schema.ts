import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ConvenioDocument = Convenio & Document;

@Schema({ timestamps: true, collection: 'convenios' })
export class Convenio {
  @Prop({ required: true })
  nombre: string;

  @Prop()
  descripcion: string;

  @Prop({ required: true, default: 0 })
  comisionPorcentaje: number;

  @Prop({ default: 0 })
  descuentoPorcentaje: number;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'EmpresaProveedora' }] })
  empresasProveedoras: Types.ObjectId[];

  @Prop({ type: Object })
  reglas: {
    comisionMinima: number;
    comisionMaxima: number;
    aplicaIVASobreComision: boolean;
    diasPago: number;
  };

  @Prop({ default: true })
  activo: boolean;

  @Prop({ type: Date })
  fechaVigencia: Date;
}

export const ConvenioSchema = SchemaFactory.createForClass(Convenio);
