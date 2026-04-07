import { IsString, IsNotEmpty, IsOptional, IsNumber, IsDateString, IsEnum, IsMongoId } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFacturaDto {
  @ApiProperty({ example: 'FC-A-0001-00001234' }) @IsString() @IsNotEmpty() numero: string;
  @ApiPropertyOptional() @IsOptional() @IsString() finnegansId?: string;
  @ApiProperty({ enum: ['A', 'B', 'C', 'M', 'E', 'NC-A', 'NC-B', 'NC-C', 'ND-A', 'ND-B', 'ND-C'] }) @IsEnum(['A', 'B', 'C', 'M', 'E', 'NC-A', 'NC-B', 'NC-C', 'ND-A', 'ND-B', 'ND-C']) tipo: string;
  @ApiProperty() @IsDateString() fecha: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() fechaVencimiento?: string;
  @ApiProperty({ example: 100000 }) @IsNumber() montoNeto: number;
  @ApiPropertyOptional({ example: 21000 }) @IsOptional() @IsNumber() montoIva?: number;
  @ApiProperty({ example: 121000 }) @IsNumber() montoTotal: number;
  @ApiPropertyOptional({ example: 'ARS' }) @IsOptional() @IsString() moneda?: string;
  @ApiProperty() @IsMongoId() @IsNotEmpty() empresaProveedora: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() empresaCliente?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() ordenPago?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() archivoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() archivoKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() archivoNombre?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() facturaRelacionada?: string;
}
