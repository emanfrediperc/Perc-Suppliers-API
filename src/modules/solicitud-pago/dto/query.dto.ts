import { IsEnum, IsMongoId, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MAX_PAGINATION_LIMIT } from '../../../common/dto/pagination-query.dto';
import { ESTADOS_SOLICITUD, TIPOS_SOLICITUD } from '../schemas/solicitud-pago.schema';
import type { EstadoSolicitud, TipoSolicitud } from '../schemas/solicitud-pago.schema';

export class SolicitudPagoQueryDto {
  @ApiPropertyOptional({ enum: ESTADOS_SOLICITUD })
  @IsOptional() @IsEnum(ESTADOS_SOLICITUD) estado?: EstadoSolicitud;

  @ApiPropertyOptional({ enum: TIPOS_SOLICITUD })
  @IsOptional() @IsEnum(TIPOS_SOLICITUD) tipo?: TipoSolicitud;

  @ApiPropertyOptional() @IsOptional() @IsMongoId() factura?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() ordenPago?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() empresaProveedora?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @ApiPropertyOptional({ maximum: MAX_PAGINATION_LIMIT }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_PAGINATION_LIMIT) limit?: number = 20;
}
