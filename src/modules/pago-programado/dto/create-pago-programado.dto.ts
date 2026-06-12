import { IsMongoId, IsNumber, IsEnum, IsDateString, IsOptional, IsString, IsPositive, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePagoProgramadoDto {
  @ApiProperty() @IsMongoId() ordenPago: string;
  @ApiProperty({ example: 100000 }) @IsNumber() @IsPositive() montoBase: number;
  @ApiProperty({ enum: ['transferencia', 'cheque', 'efectivo', 'compensacion', 'otro'] })
  @IsEnum(['transferencia', 'cheque', 'efectivo', 'compensacion', 'otro']) medioPago: string;
  @ApiProperty() @IsDateString() fechaProgramada: string;
  @ApiPropertyOptional({ example: 0 }) @IsOptional() @IsNumber() @Min(0) retencionIIBB?: number;
  @ApiPropertyOptional({ example: 0 }) @IsOptional() @IsNumber() @Min(0) retencionGanancias?: number;
  @ApiPropertyOptional({ example: 0 }) @IsOptional() @IsNumber() @Min(0) retencionIVA?: number;
  @ApiPropertyOptional({ example: 0 }) @IsOptional() @IsNumber() @Min(0) retencionSUSS?: number;
  @ApiPropertyOptional({ example: 0 }) @IsOptional() @IsNumber() @Min(0) otrasRetenciones?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() referenciaPago?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() observaciones?: string;
}
