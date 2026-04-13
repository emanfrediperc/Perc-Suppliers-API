import { IsOptional, IsPositive, Min, MaxLength, Matches, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsPositive()
  page: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Min(1)
  limit: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9\s\-_.áéíóúñÁÉÍÓÚÑüÜ]+$/, { message: 'El campo de busqueda contiene caracteres no permitidos' })
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['fecha', 'numero', 'razonSocial', 'cuit', 'nombre', 'nombreFantasia', 'montoTotal', 'estado', 'createdAt', 'updatedAt', 'descripcion', 'comisionPorcentaje', 'descuentoPorcentaje'])
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  sortOrder?: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({ enum: ['xlsx', 'csv', 'pdf'], description: 'Formato de exportación (solo usado por endpoints /export)' })
  @IsOptional()
  @IsIn(['xlsx', 'csv', 'pdf'])
  formato?: string;
}
