import { Injectable, Logger, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { XMLParser } from 'fast-xml-parser';
import { WsaaClient } from './wsaa.client';

export interface PadronPersona {
  cuit: string;
  razonSocial: string;
  estadoClave: string;
  tipoPersona: string;
  tipoClave: string;
  domicilio: string;
  condicionIva: string;
  monotributo: { categoria: string; descripcion: string } | null;
  actividades: { codigo: string; descripcion: string; orden: number }[];
  fechaInscripcion: string | null;
  raw: any;
}

@Injectable()
export class PadronA5Client {
  private readonly logger = new Logger(PadronA5Client.name);

  constructor(
    private readonly wsaa: WsaaClient,
    private readonly config: ConfigService,
  ) {}

  async getPersona(cuit: string): Promise<PadronPersona | null> {
    const cleaned = cuit.replace(/-/g, '').trim();
    if (!/^\d{11}$/.test(cleaned)) {
      throw new BadRequestException('CUIT inválido — debe ser 11 dígitos');
    }

    const ticket = await this.wsaa.getTicket('ws_sr_padron_a5');
    const cuitRepresentado = this.config.get<string>('AFIP_CUIT_REPRESENTADO');
    if (!cuitRepresentado) throw new InternalServerErrorException('AFIP_CUIT_REPRESENTADO no configurado');

    const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:a5="http://a5.soap.ws.server.puc.sr/">
  <soapenv:Body>
    <a5:getPersona>
      <token>${ticket.token}</token>
      <sign>${ticket.sign}</sign>
      <cuitRepresentada>${cuitRepresentado}</cuitRepresentada>
      <idPersona>${cleaned}</idPersona>
    </a5:getPersona>
  </soapenv:Body>
</soapenv:Envelope>`;

    const url = this.padronUrl();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: '',
      },
      body: envelope,
    });
    const text = await res.text();
    if (!res.ok) {
      this.logger.error(`Padrón A5 HTTP ${res.status}: ${text.slice(0, 500)}`);
      throw new InternalServerErrorException('AFIP Padrón A5 devolvió error');
    }

    return this.parseResponse(text, cleaned);
  }

  private parseResponse(xml: string, cuit: string): PadronPersona | null {
    const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false });
    const parsed = parser.parse(xml);
    const fault = parsed?.Envelope?.Body?.Fault;
    if (fault) {
      const fs = fault.faultstring || JSON.stringify(fault);
      if (typeof fs === 'string' && /no existe persona/i.test(fs)) return null;
      throw new InternalServerErrorException(`AFIP A5 fault: ${fs}`);
    }

    const persona = parsed?.Envelope?.Body?.getPersonaResponse?.personaReturn?.persona;
    if (!persona) return null;

    const impuestos = this.toArray(persona.impuesto).map((i: any) => Number(i.idImpuesto));
    const monotributoData = this.toArray(persona.categoria).find((c: any) => /monotributo/i.test(c.descripcionCategoria || ''));
    const condicionIva = this.mapCondicionIva(impuestos, !!monotributoData);

    const dom = persona.domicilioFiscal;
    const domicilio = dom
      ? [dom.direccion, dom.localidad, dom.descripcionProvincia].filter(Boolean).join(', ')
      : '';

    const actividades = this.toArray(persona.actividad).map((a: any) => ({
      codigo: String(a.idActividad),
      descripcion: String(a.descripcionActividad || ''),
      orden: Number(a.orden) || 0,
    }));

    return {
      cuit,
      razonSocial: persona.nombre || persona.razonSocial || '',
      estadoClave: persona.estadoClave || '',
      tipoPersona: persona.tipoPersona || '',
      tipoClave: persona.tipoClave || '',
      domicilio,
      condicionIva,
      monotributo: monotributoData
        ? {
            categoria: String(monotributoData.idCategoria || ''),
            descripcion: String(monotributoData.descripcionCategoria || ''),
          }
        : null,
      actividades,
      fechaInscripcion: persona.fechaInscripcion || null,
      raw: persona,
    };
  }

  private mapCondicionIva(impuestos: number[], esMonotributo: boolean): string {
    if (impuestos.includes(30)) return 'IVA Responsable Inscripto';
    if (esMonotributo) return 'Responsable Monotributo';
    if (impuestos.includes(32)) return 'IVA Sujeto Exento';
    if (impuestos.includes(33)) return 'IVA No Alcanzado';
    return '-';
  }

  private toArray(v: any): any[] {
    if (v == null) return [];
    return Array.isArray(v) ? v : [v];
  }

  private padronUrl(): string {
    const env = this.config.get<string>('AFIP_ENV', 'homologacion');
    return env === 'produccion'
      ? 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5'
      : 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5';
  }
}
