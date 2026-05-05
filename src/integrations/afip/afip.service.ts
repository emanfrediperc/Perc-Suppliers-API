import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PadronA5Client } from './padron-a5.client';

export interface AfipContribuyente {
  razonSocial: string;
  condicionIva: string;
  domicilio: string;
  tipoPersona: string;
  activo: boolean;
  estadoClave?: string;
  monotributo?: { categoria: string; descripcion: string } | null;
  fechaInscripcion?: string | null;
  actividadPrincipal?: { codigo: string; descripcion: string } | null;
}

@Injectable()
export class AfipService {
  private readonly logger = new Logger(AfipService.name);

  constructor(
    private readonly padron: PadronA5Client,
    private readonly config: ConfigService,
  ) {}

  async consultarCuit(cuit: string): Promise<AfipContribuyente | null> {
    const cleaned = cuit.replace(/-/g, '').trim();
    if (!/^\d{11}$/.test(cleaned)) {
      throw new BadRequestException('CUIT inválido — debe ser 11 dígitos');
    }

    if (!this.isConfigured()) {
      this.logger.warn('AFIP padrón no configurado (falta cert/key/cuitRepresentado) — devolviendo null');
      return null;
    }

    try {
      const persona = await this.padron.getPersona(cleaned);
      if (!persona) return null;

      const principal = persona.actividades.sort((a, b) => a.orden - b.orden)[0] ?? null;
      return {
        razonSocial: persona.razonSocial,
        condicionIva: persona.condicionIva,
        domicilio: persona.domicilio,
        tipoPersona: persona.tipoPersona,
        activo: persona.estadoClave === 'ACTIVO',
        estadoClave: persona.estadoClave,
        monotributo: persona.monotributo,
        fechaInscripcion: persona.fechaInscripcion,
        actividadPrincipal: principal
          ? { codigo: principal.codigo, descripcion: principal.descripcion }
          : null,
      };
    } catch (error: any) {
      this.logger.warn(`Error consultando CUIT ${cleaned}: ${error.message}`);
      return null;
    }
  }

  isConfigured(): boolean {
    return (
      !!this.config.get('AFIP_CERT_PATH') &&
      !!this.config.get('AFIP_KEY_PATH') &&
      !!this.config.get('AFIP_CUIT_REPRESENTADO')
    );
  }
}
