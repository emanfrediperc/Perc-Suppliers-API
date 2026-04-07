import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Configuracion, ConfiguracionDocument } from './schemas/configuracion.schema';

const DEFAULTS: Record<string, { valor: Record<string, any>; descripcion: string }> = {
  umbrales_aprobacion: {
    valor: {
      montoUmbral: 100000,
      rules: [
        { min: 100000, max: 500000, aprobaciones: 1 },
        { min: 500000, max: null, aprobaciones: 2 },
      ],
    },
    descripcion: 'Umbrales de monto para requerir aprobaciones',
  },
};

@Injectable()
export class ConfiguracionService {
  constructor(
    @InjectModel(Configuracion.name) private model: Model<ConfiguracionDocument>,
  ) {}

  async get(clave: string): Promise<Record<string, any>> {
    const config = await this.model.findOne({ clave });
    if (config) return config.valor;
    const defaults = DEFAULTS[clave];
    return defaults?.valor || {};
  }

  async set(clave: string, valor: Record<string, any>, descripcion?: string): Promise<ConfiguracionDocument> {
    return this.model.findOneAndUpdate(
      { clave },
      { valor, ...(descripcion && { descripcion }) },
      { new: true, upsert: true },
    ) as Promise<ConfiguracionDocument>;
  }

  async getAll(): Promise<ConfiguracionDocument[]> {
    return this.model.find().sort({ clave: 1 });
  }

  async getApprovalConfig(): Promise<{ montoUmbral: number; rules: Array<{ min: number; max: number | null; aprobaciones: number }> }> {
    const config = await this.get('umbrales_aprobacion');
    return {
      montoUmbral: config.montoUmbral ?? 100000,
      rules: config.rules ?? [
        { min: 100000, max: 500000, aprobaciones: 1 },
        { min: 500000, max: null, aprobaciones: 2 },
      ],
    };
  }
}
