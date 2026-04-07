import { Injectable } from '@nestjs/common';
import { IFinnegansService } from './finnegans.interface';

@Injectable()
export class FinnegansMockService extends IFinnegansService {
  private ordenesPago = [
    {
      finnegansId: 'FIN-OP-001', numero: 'OP-2024-001', fecha: '2024-12-01T00:00:00.000Z',
      montoTotal: 500000, moneda: 'ARS', empresaCuit: '30-71234567-9',
      facturas: [
        { finnegansId: 'FIN-FC-001', numero: 'FC-A-0001-00001001', tipo: 'A', fecha: '2024-11-15T00:00:00.000Z', fechaVencimiento: '2024-12-15T00:00:00.000Z', montoNeto: 165289.26, montoIva: 34710.74, montoTotal: 200000, moneda: 'ARS', empresaClienteCuit: '30-70000001-5' },
        { finnegansId: 'FIN-FC-002', numero: 'FC-A-0001-00001002', tipo: 'A', fecha: '2024-11-20T00:00:00.000Z', fechaVencimiento: '2024-12-20T00:00:00.000Z', montoNeto: 247933.88, montoIva: 52066.12, montoTotal: 300000, moneda: 'ARS', empresaClienteCuit: '30-70000001-5' },
      ],
    },
    {
      finnegansId: 'FIN-OP-002', numero: 'OP-2024-002', fecha: '2024-12-10T00:00:00.000Z',
      montoTotal: 750000, moneda: 'ARS', empresaCuit: '30-71234568-7',
      facturas: [
        { finnegansId: 'FIN-FC-003', numero: 'FC-A-0002-00000501', tipo: 'A', fecha: '2024-11-25T00:00:00.000Z', fechaVencimiento: '2024-12-25T00:00:00.000Z', montoNeto: 619834.71, montoIva: 130165.29, montoTotal: 750000, moneda: 'ARS', empresaClienteCuit: '30-70000002-3' },
      ],
    },
    {
      finnegansId: 'FIN-OP-003', numero: 'OP-2025-001', fecha: '2025-01-05T00:00:00.000Z',
      montoTotal: 1200000, moneda: 'ARS', empresaCuit: '30-71234567-9',
      facturas: [
        { finnegansId: 'FIN-FC-004', numero: 'FC-A-0001-00001003', tipo: 'A', fecha: '2024-12-20T00:00:00.000Z', fechaVencimiento: '2025-01-20T00:00:00.000Z', montoNeto: 495867.77, montoIva: 104132.23, montoTotal: 600000, moneda: 'ARS', empresaClienteCuit: '30-70000001-5' },
        { finnegansId: 'FIN-FC-005', numero: 'FC-B-0001-00000201', tipo: 'B', fecha: '2024-12-22T00:00:00.000Z', fechaVencimiento: '2025-01-22T00:00:00.000Z', montoNeto: 600000, montoIva: 0, montoTotal: 600000, moneda: 'ARS', empresaClienteCuit: '30-70000003-1' },
      ],
    },
  ];

  private companies = new Map<string, any>();

  async getOrdenesDePageFromERP(): Promise<any[]> { return this.ordenesPago; }
  async getOrdenDePagoById(id: string): Promise<any> { return this.ordenesPago.find((op) => op.finnegansId === id) || null; }
  async getFacturasFromERP(): Promise<any[]> { return this.ordenesPago.flatMap((op) => op.facturas.map((f) => ({ ...f, empresaCuit: op.empresaCuit }))); }
  async getFacturaById(id: string): Promise<any> {
    for (const op of this.ordenesPago) { const f = op.facturas.find((fc) => fc.finnegansId === id); if (f) return { ...f, empresaCuit: op.empresaCuit }; }
    return null;
  }
  async createCompanyInERP(company: any): Promise<any> {
    const finnegansId = `FIN-EMP-${Date.now()}`;
    const created = { ...company, finnegansId };
    this.companies.set(finnegansId, created);
    return created;
  }
  async getCompanyFromERP(id: string): Promise<any> { return this.companies.get(id) || null; }
}
