import { IsOptional, IsDateString, IsMongoId, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ReporteQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  desde?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  hasta?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  empresaProveedora?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  convenio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  formato?: string;
}
