import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO de edicion de Orden de Pago.
 *
 * NO usa PartialType(CreateOrdenPagoDto): eso reabriria el mass-assignment de
 * campos que mueven dinero / cambian ownership / estado (montoTotal,
 * empresaProveedora, facturas). El gate de aprobacion calcula cuantas firmas se
 * exigen segun el montoTotal UNA sola vez, en create(). Permitir editar
 * montoTotal post-aprobacion via PATCH reabre saldo pagable sin re-aprobacion ni
 * step-up (ver OrdenPagoService.pagar(): saldoPendiente = montoTotal - montoPagado).
 *
 * Aca solo se exponen campos metadata seguros que no alteran el monto aprobado
 * ni a quien se le paga. Cualquier cambio de monto debe re-crear la orden (que
 * vuelve a pasar por el gate de aprobacion).
 */
export class UpdateOrdenPagoDto {
  @ApiPropertyOptional({ example: 'ARS' })
  @IsOptional()
  @IsString()
  moneda?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  finnegansId?: string;
}
