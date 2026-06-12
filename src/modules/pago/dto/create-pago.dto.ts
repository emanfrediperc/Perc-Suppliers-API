import { IsString, IsNotEmpty, IsOptional, IsNumber, IsDateString, IsEnum, IsPositive, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePagoDto {
  @ApiProperty() @IsString() @IsNotEmpty() factura: string;
  @ApiProperty() @IsDateString() fechaPago: string;
  @ApiProperty({ example: 100000 }) @IsNumber() @IsPositive() montoBase: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) retencionIIBB?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) retencionGanancias?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) retencionIVA?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) retencionSUSS?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) otrasRetenciones?: number;
  @ApiProperty({ example: 95000 }) @IsNumber() @Min(0) montoNeto: number;
  @ApiProperty({ enum: ['transferencia', 'cheque', 'efectivo', 'compensacion', 'otro'] })
  @IsEnum(['transferencia', 'cheque', 'efectivo', 'compensacion', 'otro']) medioPago: string;
  @ApiPropertyOptional() @IsOptional() @IsString() referenciaPago?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() observaciones?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() convenioAplicado?: string;
  // `estado` removido a proposito: campo de servidor. La maquina de estados se
  // transiciona solo via el listener de aprobacion / metodos internos (no por API).
}
