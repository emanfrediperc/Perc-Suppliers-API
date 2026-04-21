export enum PrestamoStatus {
  ACTIVE = 'ACTIVE',
  CLEARED = 'CLEARED',
  RENEWED = 'RENEWED',
  // T018 — gate de aprobación
  ESPERANDO_APROBACION = 'ESPERANDO_APROBACION',
  // Estado terminal cuando la aprobación es rechazada
  ANULADO = 'ANULADO',
}
