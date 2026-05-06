import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EmpresaProveedoraDocument = EmpresaProveedora & Document;

@Schema({ timestamps: true, collection: 'empresas_proveedoras' })
export class EmpresaProveedora {
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

  @Prop()
  contacto: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Convenio' }] })
  convenios: Types.ObjectId[];

  @Prop({ default: true })
  activa: boolean;

  @Prop({ type: Object })
  datosBancarios: {
    banco: string;
    cbu: string;
    alias: string;
  };

  /**
   * Override manual del check apócrifo. Si está en true, se saltea el bloqueo
   * automático aunque AFIP marque el CUIT como apócrifo. Útil cuando AFIP marca
   * por error y la empresa fue verificada externamente.
   */
  @Prop({ default: false })
  apocrifoOverride: boolean;

  @Prop()
  apocrifoOverrideMotivo?: string;

  @Prop()
  apocrifoOverridePor?: string;

  @Prop()
  apocrifoOverrideFecha?: Date;
}

export const EmpresaProveedoraSchema = SchemaFactory.createForClass(EmpresaProveedora);
