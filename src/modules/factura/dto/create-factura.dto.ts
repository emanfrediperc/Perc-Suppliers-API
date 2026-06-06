import { IsString, IsNotEmpty, IsOptional, IsNumber, IsDateString, IsEnum, IsMongoId, IsPositive, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFacturaDto {
  @ApiProperty({ example: 'FC-A-0001-00001234' }) @IsString() @IsNotEmpty() numero: string;
  @ApiPropertyOptional() @IsOptional() @IsString() finnegansId?: string;
  @ApiProperty({ enum: ['A', 'B', 'C', 'M', 'E', 'NC-A', 'NC-B', 'NC-C', 'ND-A', 'ND-B', 'ND-C'] }) @IsEnum(['A', 'B', 'C', 'M', 'E', 'NC-A', 'NC-B', 'NC-C', 'ND-A', 'ND-B', 'ND-C']) tipo: string;
  @ApiProperty() @IsDateString() fecha: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() fechaVencimiento?: string;
  @ApiProperty({ example: 100000 }) @IsNumber() @Min(0) montoNeto: number;
  @ApiPropertyOptional({ example: 21000 }) @IsOptional() @IsNumber() @Min(0) montoIva?: number;
  @ApiProperty({ example: 121000 }) @IsNumber() @IsPositive() montoTotal: number;
  @ApiPropertyOptional({ example: 'ARS' }) @IsOptional() @IsString() moneda?: string;
  @ApiProperty() @IsMongoId() @IsNotEmpty() empresaProveedora: string;
  @ApiProperty() @IsMongoId() @IsNotEmpty() empresaCliente: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() ordenPago?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() archivoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() archivoKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() archivoNombre?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() facturaRelacionada?: string;
}
