import { Injectable, Logger } from '@nestjs/common';

export interface AfipContribuyente {
  razonSocial: string;
  condicionIva: string;
  domicilio: string;
  tipoPersona: string;
  activo: boolean;
}

@Injectable()
export class AfipService {
  private readonly logger = new Logger(AfipService.name);

  async consultarCuit(cuit: string): Promise<AfipContribuyente | null> {
    const cleaned = cuit.replace(/-/g, '');
    try {
      const res = await fetch(
        `https://afip.tangofactura.com/Rest/GetContribuyenteFull?cuit=${cleaned}`,
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || data.errorGetData) return null;

      return {
        razonSocial: data.Contribuyente?.nombre || data.denominacion || null,
        condicionIva: this.mapCondicionIva(data),
        domicilio: this.buildDomicilio(data),
        tipoPersona:
          data.Contribuyente?.tipoClave === 'CUIT'
            ? data.Contribuyente?.tipoPersona || '-'
            : '-',
        activo: data.Contribuyente?.estadoClave === 'ACTIVO',
      };
    } catch (error) {
      this.logger.warn(`Error consultando CUIT ${cleaned}: ${error.message}`);
      return null;
    }
  }

  private mapCondicionIva(data: any): string {
    const impuestos = data.Contribuyente?.impuestos || [];

    // Check for IVA Responsable Inscripto (impuesto 30 or 32 in some cases, 20/21 for IVA)
    if (impuestos.includes(20) || impuestos.includes(21))
      return 'IVA Responsable Inscripto';

    // Check for Monotributo
    if (data.Contribuyente?.categoriasMonotributo?.length > 0)
      return 'Responsable Monotributo';

    // Check for IVA Exento
    if (impuestos.includes(32)) return 'IVA Sujeto Exento';

    return '-';
  }

  private buildDomicilio(data: any): string {
    const dom = data.Contribuyente?.domicilioFiscal;
    if (!dom) return '';
    const parts = [dom.direccion, dom.localidad, dom.descripcionProvincia].filter(Boolean);
    return parts.join(', ');
  }
}
