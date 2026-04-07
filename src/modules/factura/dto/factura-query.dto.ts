import { IsOptional, IsString, IsMongoId, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class FacturaQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  empresaProveedora?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  empresaCliente?: string;

  @ApiPropertyOptional({ enum: ['pendiente', 'parcial', 'pagada', 'anulada'] })
  @IsOptional()
  @IsString()
  estado?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  fechaDesde?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  fechaHasta?: string;

  @ApiPropertyOptional({ enum: ['xlsx', 'csv'] })
  @IsOptional()
  @IsString()
  formato?: string;
}
