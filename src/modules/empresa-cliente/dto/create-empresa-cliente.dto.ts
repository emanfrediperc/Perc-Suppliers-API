import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsCuit } from '../../../common/validators/cuit.validator';

export class CreateEmpresaClienteDto {
  @ApiProperty({ example: '30-71234567-9' }) @IsString() @IsNotEmpty() @IsCuit() cuit: string;
  @ApiProperty({ example: 'Cliente SA' }) @IsString() @IsNotEmpty() razonSocial: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nombreFantasia?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() condicionIva?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() direccion?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() telefono?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activa?: boolean;
}
