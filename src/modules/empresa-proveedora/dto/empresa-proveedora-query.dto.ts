import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class EmpresaProveedoraQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filtrar empresas sin convenio asignado', enum: ['true', 'false'] })
  @IsOptional()
  @IsString()
  sinConvenio?: string;
}
