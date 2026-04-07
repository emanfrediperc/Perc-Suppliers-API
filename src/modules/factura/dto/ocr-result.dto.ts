export interface OcrResultDto {
  numero?: string;
  tipo?: string;
  fecha?: string;
  fechaVencimiento?: string;
  montoNeto?: number;
  montoIva?: number;
  montoTotal?: number;
  cuitProveedor?: string;
  razonSocialProveedor?: string;
  cuitCliente?: string;
  razonSocialCliente?: string;
}
