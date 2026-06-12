import { BadRequestException, Injectable } from '@nestjs/common';
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
    this.validarConfigSeguridad(clave, valor);
    return this.model.findOneAndUpdate(
      { clave },
      { valor, ...(descripcion && { descripcion }) },
      { new: true, upsert: true },
    ) as Promise<ConfiguracionDocument>;
  }

  /**
   * Valida claves de configuracion sensibles a seguridad. Sin esto, un admin podia
   * degradar `umbrales_aprobacion` a 0 firmas (o reglas mal formadas) y desactivar el
   * doble-control de N-firmas globalmente. Piso server-side: aprobaciones >= 1.
   */
  private validarConfigSeguridad(clave: string, valor: Record<string, any>): void {
    if (clave !== 'umbrales_aprobacion') return;

    const montoUmbral = valor?.montoUmbral;
    if (typeof montoUmbral !== 'number' || !Number.isFinite(montoUmbral) || montoUmbral < 0) {
      throw new BadRequestException(
        'umbrales_aprobacion.montoUmbral debe ser un numero >= 0',
      );
    }

    const rules = valor?.rules;
    if (!Array.isArray(rules) || rules.length === 0) {
      throw new BadRequestException(
        'umbrales_aprobacion.rules debe ser un array no vacio',
      );
    }

    for (const rule of rules) {
      if (typeof rule?.min !== 'number' || !Number.isFinite(rule.min) || rule.min < 0) {
        throw new BadRequestException(
          'umbrales_aprobacion.rules[].min debe ser un numero >= 0',
        );
      }
      if (rule.max !== null && (typeof rule.max !== 'number' || !Number.isFinite(rule.max) || rule.max <= rule.min)) {
        throw new BadRequestException(
          'umbrales_aprobacion.rules[].max debe ser null o un numero > min',
        );
      }
      if (!Number.isInteger(rule?.aprobaciones) || rule.aprobaciones < 1) {
        throw new BadRequestException(
          'umbrales_aprobacion.rules[].aprobaciones debe ser un entero >= 1 (piso server-side: el doble-control no se puede desactivar)',
        );
      }
    }
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
