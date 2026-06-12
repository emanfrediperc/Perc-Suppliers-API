import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO de edicion de Pago.
 *
 * NO usa PartialType(CreatePagoDto): eso reabriria el mass-assignment de los
 * campos monetarios (montoBase, montoNeto, retencion*, otrasRetenciones). Un Pago
 * se crea/confirma via solicitud-pago.procesar() con el calculo del PagoCalculator
 * dentro de una transaccion que ajusta factura.saldoPendiente y orden.saldoPendiente.
 * Permitir reescribir montoBase/montoNeto por PATCH NO recalcula esos saldos
 * (descalce contable) y falsea el comprobante PDF (MONTO NETO TRANSFERIDO).
 *
 * Solo se exponen campos descriptivos seguros. Corregir montos exige anular() +
 * re-emision por el flujo de aprobacion.
 */
export class UpdatePagoDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenciaPago?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observaciones?: string;
}
