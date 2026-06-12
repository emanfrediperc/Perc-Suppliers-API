import { IsOptional, IsInt, Min, Max, MaxLength, Matches, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

// Tope de filas por pagina que un cliente puede pedir. Los endpoints /export que
// legitimamente necesitan mas filas sobreescriben `limit` server-side DESPUES de
// validar el DTO (ver factura/audit-log controllers), por lo que este @Max no los
// limita: solo acota lo que un usuario puede pedir directo via querystring.
export const MAX_PAGINATION_LIMIT = 100;

export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: MAX_PAGINATION_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGINATION_LIMIT)
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
