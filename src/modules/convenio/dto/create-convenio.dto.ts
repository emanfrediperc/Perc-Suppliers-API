import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsDateString, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class ReglasConvenioDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() comisionMinima?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() comisionMaxima?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() aplicaIVASobreComision?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsNumber() diasPago?: number;
}

export class CreateConvenioDto {
  @ApiProperty({ example: 'Convenio Standard' }) @IsString() @IsNotEmpty() nombre: string;
  @ApiPropertyOptional() @IsOptional() @IsString() descripcion?: string;
  @ApiProperty({ example: 5 }) @IsNumber() comisionPorcentaje: number;
  @ApiPropertyOptional({ example: 2 }) @IsOptional() @IsNumber() descuentoPorcentaje?: number;
  @ApiPropertyOptional() @IsOptional() @ValidateNested() @Type(() => ReglasConvenioDto) reglas?: ReglasConvenioDto;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activo?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsDateString() fechaVigencia?: string;
}
