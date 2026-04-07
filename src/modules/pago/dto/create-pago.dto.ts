import { IsString, IsNotEmpty, IsOptional, IsNumber, IsDateString, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePagoDto {
  @ApiProperty() @IsString() @IsNotEmpty() factura: string;
  @ApiProperty() @IsDateString() fechaPago: string;
  @ApiProperty({ example: 100000 }) @IsNumber() montoBase: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() retencionIIBB?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() retencionGanancias?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() retencionIVA?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() retencionSUSS?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() otrasRetenciones?: number;
  @ApiProperty({ example: 95000 }) @IsNumber() montoNeto: number;
  @ApiProperty({ enum: ['transferencia', 'cheque', 'efectivo', 'compensacion', 'otro'] })
  @IsEnum(['transferencia', 'cheque', 'efectivo', 'compensacion', 'otro']) medioPago: string;
  @ApiPropertyOptional() @IsOptional() @IsString() referenciaPago?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() observaciones?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() convenioAplicado?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() estado?: string;
}
