export const APROBACION_RESUELTA = 'aprobacion.resuelta';

export interface AprobacionResueltaEvent {
  aprobacionId: string;
  entidad: 'ordenes-pago' | 'pagos' | 'prestamos' | 'compras-fx';
  entidadId: string;
  estado: 'aprobada' | 'rechazada';
}

export const APROBACION_REENVIADA = 'aprobacion.reenviada';

export interface AprobacionReenviadaEvent {
  aprobacionId: string;
  entidad: 'ordenes-pago' | 'pagos' | 'prestamos' | 'compras-fx';
  entidadId: string;
}
