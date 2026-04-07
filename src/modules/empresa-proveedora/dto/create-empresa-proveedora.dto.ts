import { IsString, IsNotEmpty, IsOptional, IsBoolean, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsCuit } from '../../../common/validators/cuit.validator';

class DatosBancariosDto {
  @ApiPropertyOptional() @IsOptional() @IsString() banco?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cbu?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() alias?: string;
}

export class CreateEmpresaProveedoraDto {
  @ApiProperty({ example: '30-71234567-9' }) @IsString() @IsNotEmpty() @IsCuit() cuit: string;
  @ApiProperty({ example: 'Proveedor SA' }) @IsString() @IsNotEmpty() razonSocial: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nombreFantasia?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() condicionIva?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() direccion?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() telefono?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contacto?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activa?: boolean;
  @ApiPropertyOptional() @IsOptional() @ValidateNested() @Type(() => DatosBancariosDto) datosBancarios?: DatosBancariosDto;
}
