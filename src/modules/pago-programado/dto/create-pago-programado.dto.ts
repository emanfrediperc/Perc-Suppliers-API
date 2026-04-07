import { IsMongoId, IsNumber, IsEnum, IsDateString, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePagoProgramadoDto {
  @ApiProperty() @IsMongoId() ordenPago: string;
  @ApiProperty({ example: 100000 }) @IsNumber() montoBase: number;
  @ApiProperty({ enum: ['transferencia', 'cheque', 'efectivo', 'compensacion', 'otro'] })
  @IsEnum(['transferencia', 'cheque', 'efectivo', 'compensacion', 'otro']) medioPago: string;
  @ApiProperty() @IsDateString() fechaProgramada: string;
  @ApiPropertyOptional({ example: 0 }) @IsOptional() @IsNumber() retencionIIBB?: number;
  @ApiPropertyOptional({ example: 0 }) @IsOptional() @IsNumber() retencionGanancias?: number;
  @ApiPropertyOptional({ example: 0 }) @IsOptional() @IsNumber() retencionIVA?: number;
  @ApiPropertyOptional({ example: 0 }) @IsOptional() @IsNumber() retencionSUSS?: number;
  @ApiPropertyOptional({ example: 0 }) @IsOptional() @IsNumber() otrasRetenciones?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() referenciaPago?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() observaciones?: string;
}
