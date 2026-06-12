import { IsString, IsNotEmpty, IsOptional, IsNumber, IsDateString, IsArray, IsMongoId } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrdenPagoDto {
  @ApiProperty({ example: 'OP-001' }) @IsString() @IsNotEmpty() numero: string;
  @ApiPropertyOptional() @IsOptional() @IsString() finnegansId?: string;
  @ApiProperty() @IsDateString() fecha: string;
  @ApiProperty() @IsMongoId() @IsNotEmpty() empresaProveedora: string;
  @ApiProperty({ example: 150000 }) @IsNumber() montoTotal: number;
  @ApiPropertyOptional({ example: 'ARS' }) @IsOptional() @IsString() moneda?: string;
  // `estado` removido a proposito: campo de servidor. Se fuerza 'esperando_aprobacion'
  // al crear y solo se transiciona via aprobacion / metodos internos (no por API).
  @ApiPropertyOptional() @IsOptional() @IsArray() facturas?: string[];
}
