export abstract class IFinnegansService {
  abstract getOrdenesDePageFromERP(): Promise<any[]>;
  abstract getOrdenDePagoById(id: string): Promise<any>;
  abstract getFacturasFromERP(): Promise<any[]>;
  abstract getFacturaById(id: string): Promise<any>;
  abstract createCompanyInERP(company: any): Promise<any>;
  abstract getCompanyFromERP(id: string): Promise<any>;
}
