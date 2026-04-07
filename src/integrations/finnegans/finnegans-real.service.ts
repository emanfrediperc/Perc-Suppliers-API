import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IFinnegansService } from './finnegans.interface';

@Injectable()
export class FinnegansRealService extends IFinnegansService {
  private readonly logger = new Logger(FinnegansRealService.name);
  private readonly baseUrl: string;
  private readonly authUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private configService: ConfigService) {
    super();
    this.baseUrl = this.configService.get<string>('finnegans.baseUrl') || '';
    this.authUrl = this.configService.get<string>('finnegans.authUrl') || '';
    this.clientId = this.configService.get<string>('finnegans.clientId') || '';
    this.clientSecret = this.configService.get<string>('finnegans.clientSecret') || '';
    this.logger.log(`Finnegans real service initialized — baseUrl: ${this.baseUrl}`);
  }

  // ============ AUTH ============

  private async getToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }
    this.logger.log('Requesting new Finnegans access token...');
    const url = `${this.authUrl}?client_id=${encodeURIComponent(this.clientId)}&client_secret=${encodeURIComponent(this.clientSecret)}`;
    const res = await this.request<any>(url, 'GET', null, true);
    this.accessToken = res.access_token || res.token || res;
    // Tokens typically last 1h — refresh 5 min before expiry
    this.tokenExpiresAt = Date.now() + 55 * 60 * 1000;
    this.logger.log('Finnegans access token obtained');
    return this.accessToken!;
  }

  // ============ HTTP HELPER ============

  private async request<T>(url: string, method = 'GET', body?: any, skipAuth = false): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    const options: RequestInit = { method, headers };
    if (body) options.body = JSON.stringify(body);

    this.logger.debug(`${method} ${url}`);
    const response = await fetch(url, options);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.error(`Finnegans API error ${response.status}: ${text}`);
      throw new Error(`Finnegans API error ${response.status}: ${text}`);
    }
    return response.json() as Promise<T>;
  }

  private async apiGet<T>(path: string): Promise<T> {
    const token = await this.getToken();
    const sep = path.includes('?') ? '&' : '?';
    const url = `${this.baseUrl}${path}${sep}ACCESS_TOKEN=${token}`;
    return this.request<T>(url, 'GET');
  }

  private async apiPost<T>(path: string, body: any): Promise<T> {
    const token = await this.getToken();
    const sep = path.includes('?') ? '&' : '?';
    const url = `${this.baseUrl}${path}${sep}ACCESS_TOKEN=${token}`;
    return this.request<T>(url, 'POST', body);
  }

  private async apiPut<T>(path: string, body: any): Promise<T> {
    const token = await this.getToken();
    const sep = path.includes('?') ? '&' : '?';
    const url = `${this.baseUrl}${path}${sep}ACCESS_TOKEN=${token}`;
    return this.request<T>(url, 'PUT', body);
  }

  // ============ ORDENES DE PAGO ============

  async getOrdenesDePageFromERP(): Promise<any[]> {
    try {
      const data = await this.apiGet<any>('/api/ordenDePago');
      const ordenes = Array.isArray(data) ? data : (data.items || data.data || []);
      return ordenes.map((op: any) => this.mapOrdenPago(op));
    } catch (error) {
      this.logger.error(`Error fetching ordenes de pago: ${error.message}`);
      throw error;
    }
  }

  async getOrdenDePagoById(id: string): Promise<any> {
    try {
      const data = await this.apiGet<any>(`/api/ordenDePago/${id}`);
      return this.mapOrdenPago(data);
    } catch (error) {
      this.logger.error(`Error fetching orden de pago ${id}: ${error.message}`);
      return null;
    }
  }

  private mapOrdenPago(raw: any): any {
    return {
      finnegansId: raw.Id || raw.Codigo || raw.ExternalId || raw.id,
      numero: raw.Numero || raw.NumeroCompleto || raw.numero || '',
      fecha: raw.Fecha || raw.FechaEmision || raw.fecha,
      montoTotal: raw.Total || raw.ImporteTotal || raw.MontoTotal || raw.montoTotal || 0,
      moneda: raw.Moneda?.Codigo || raw.moneda || 'ARS',
      empresaCuit: raw.Proveedor?.IdentificacionTributaria?.Numero
                || raw.Proveedor?.CUIT
                || raw.empresaCuit || '',
      facturas: (raw.Items || raw.Comprobantes || raw.facturas || []).map((f: any) => this.mapFactura(f, raw)),
    };
  }

  // ============ FACTURAS ============

  async getFacturasFromERP(): Promise<any[]> {
    try {
      const data = await this.apiGet<any>('/api/facturaCompra');
      const facturas = Array.isArray(data) ? data : (data.items || data.data || []);
      return facturas.map((f: any) => this.mapFactura(f));
    } catch (error) {
      this.logger.error(`Error fetching facturas: ${error.message}`);
      throw error;
    }
  }

  async getFacturaById(id: string): Promise<any> {
    try {
      const data = await this.apiGet<any>(`/api/facturaCompra/${id}`);
      return this.mapFactura(data);
    } catch (error) {
      this.logger.error(`Error fetching factura ${id}: ${error.message}`);
      return null;
    }
  }

  private mapFactura(raw: any, parentOrden?: any): any {
    // Map Finnegans tipo comprobante to our simplified A/B/C/E types
    const tipoRaw = raw.TipoComprobante?.Codigo || raw.Tipo || raw.tipo || 'A';
    const tipo = this.mapTipoFactura(tipoRaw);

    return {
      finnegansId: raw.Id || raw.Codigo || raw.ExternalId || raw.finnegansId || raw.id,
      numero: raw.Numero || raw.NumeroCompleto || raw.numero || '',
      tipo,
      fecha: raw.Fecha || raw.FechaEmision || raw.fecha,
      fechaVencimiento: raw.FechaVencimiento || raw.fechaVencimiento,
      montoNeto: raw.SubTotal || raw.Neto || raw.ImporteNeto || raw.montoNeto || 0,
      montoIva: raw.IVA || raw.ImporteIVA || raw.montoIva || 0,
      montoTotal: raw.Total || raw.ImporteTotal || raw.montoTotal || 0,
      moneda: raw.Moneda?.Codigo || raw.moneda || 'ARS',
      empresaCuit: raw.Proveedor?.IdentificacionTributaria?.Numero
                || parentOrden?.Proveedor?.IdentificacionTributaria?.Numero
                || raw.empresaCuit || parentOrden?.empresaCuit || '',
      empresaClienteCuit: raw.Cliente?.IdentificacionTributaria?.Numero
                       || raw.empresaClienteCuit || '',
    };
  }

  private mapTipoFactura(tipo: string): string {
    const t = tipo.toUpperCase().replace(/\s+/g, '');
    if (t.includes('NC') || t.includes('NOTACREDITO') || t.includes('NOTA_CREDITO')) {
      if (t.includes('B')) return 'NC-B';
      if (t.includes('C')) return 'NC-C';
      return 'NC-A';
    }
    if (t.includes('ND') || t.includes('NOTADEBITO') || t.includes('NOTA_DEBITO')) {
      if (t.includes('B')) return 'ND-B';
      if (t.includes('C')) return 'ND-C';
      return 'ND-A';
    }
    if (t.includes('E') || t.includes('EXPORT')) return 'E';
    if (t.includes('M')) return 'M';
    if (t.includes('C')) return 'C';
    if (t.includes('B')) return 'B';
    return 'A';
  }

  // ============ EMPRESAS / PROVEEDORES ============

  async createCompanyInERP(company: any): Promise<any> {
    try {
      const body = {
        RazonSocial: company.razonSocial,
        Nombre: company.razonSocial,
        Codigo: company.cuit,
        Activo: true,
        IdentificacionTributaria: {
          Tipo: 'CUIT',
          Numero: company.cuit,
        },
        Direccion: company.direccion || '',
        Telefono: company.telefono || '',
        Email: company.email || '',
      };
      const result = await this.apiPost<any>('/api/proveedor', body);
      return {
        ...company,
        finnegansId: result.id || result.Id || result.Codigo || company.cuit,
      };
    } catch (error) {
      this.logger.error(`Error creating company in Finnegans: ${error.message}`);
      // Fallback: use CUIT as finnegansId so the flow doesn't break
      return { ...company, finnegansId: `LOCAL-${company.cuit}` };
    }
  }

  async getCompanyFromERP(id: string): Promise<any> {
    try {
      const data = await this.apiGet<any>(`/api/proveedor/${id}`);
      return {
        finnegansId: data.Id || data.Codigo || id,
        cuit: data.IdentificacionTributaria?.Numero || data.CUIT || '',
        razonSocial: data.RazonSocial || data.Nombre || '',
        direccion: data.Direccion || '',
        telefono: data.Telefono || '',
        email: data.Email || '',
        condicionIva: data.CategoriaIVA?.Nombre || data.CondicionIva || '',
      };
    } catch (error) {
      this.logger.error(`Error fetching company ${id} from Finnegans: ${error.message}`);
      return null;
    }
  }
}
