export const APROBACION_RESUELTA = 'aprobacion.resuelta';

export interface AprobacionResueltaEvent {
  aprobacionId: string;
  entidad: 'ordenes-pago' | 'pagos' | 'prestamos' | 'compras-fx';
  entidadId: string;
  estado: 'aprobada' | 'rechazada';
}
