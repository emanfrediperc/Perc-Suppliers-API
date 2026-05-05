import { IsEnum, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, IsDateString, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TIPOS_SOLICITUD, MEDIOS_PAGO } from '../schemas/solicitud-pago.schema';
import type { TipoSolicitud, MedioPago } from '../schemas/solicitud-pago.schema';

export class CreateSolicitudPagoDto {
  @ApiPropertyOptional({ description: 'Requerido si no se envía ordenPago' })
  @ValidateIf(o => !o.ordenPago) @IsMongoId() @IsNotEmpty() factura?: string;

  @ApiPropertyOptional({ description: 'Requerido si no se envía factura' })
  @ValidateIf(o => !o.factura) @IsMongoId() @IsNotEmpty() ordenPago?: string;

  @ApiProperty({ enum: TIPOS_SOLICITUD }) @IsEnum(TIPOS_SOLICITUD) tipo: TipoSolicitud;

  @ApiProperty({ example: 121000 }) @IsNumber() @IsPositive() monto: number;

  @ApiPropertyOptional({ description: 'Requerido cuando tipo=compromiso. Debe ser fecha futura.' })
  @ValidateIf(o => o.tipo === 'compromiso')
  @IsDateString()
  @IsNotEmpty()
  fechaVencimiento?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() nota?: string;

  @ApiProperty({ enum: MEDIOS_PAGO }) @IsEnum(MEDIOS_PAGO) medioPago: MedioPago;

  @ApiPropertyOptional() @IsOptional() @IsString() bancoOrigen?: string;
}
