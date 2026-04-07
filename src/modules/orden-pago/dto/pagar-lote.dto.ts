import { IsArray, ValidateNested, IsMongoId, IsNumber, IsOptional, IsString, IsEnum, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PagoLoteItemDto {
  @ApiProperty() @IsMongoId() ordenId: string;
  @ApiProperty({ example: 100000 }) @IsNumber() montoBase: number;
  @ApiProperty({ enum: ['transferencia', 'cheque', 'efectivo', 'compensacion', 'otro'] })
  @IsEnum(['transferencia', 'cheque', 'efectivo', 'compensacion', 'otro']) medioPago: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() fechaPago?: string;
  @ApiPropertyOptional({ example: 0 }) @IsOptional() @IsNumber() retencionIIBB?: number;
  @ApiPropertyOptional({ example: 0 }) @IsOptional() @IsNumber() retencionGanancias?: number;
  @ApiPropertyOptional({ example: 0 }) @IsOptional() @IsNumber() retencionIVA?: number;
  @ApiPropertyOptional({ example: 0 }) @IsOptional() @IsNumber() retencionSUSS?: number;
  @ApiPropertyOptional({ example: 0 }) @IsOptional() @IsNumber() otrasRetenciones?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() referenciaPago?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() observaciones?: string;
}

export class PagarLoteDto {
  @ApiProperty({ type: [PagoLoteItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PagoLoteItemDto)
  pagos: PagoLoteItemDto[];
}
