import { IsEnum, IsMongoId, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ESTADOS_SOLICITUD, TIPOS_SOLICITUD } from '../schemas/solicitud-pago.schema';
import type { EstadoSolicitud, TipoSolicitud } from '../schemas/solicitud-pago.schema';

export class SolicitudPagoQueryDto {
  @ApiPropertyOptional({ enum: ESTADOS_SOLICITUD })
  @IsOptional() @IsEnum(ESTADOS_SOLICITUD) estado?: EstadoSolicitud;

  @ApiPropertyOptional({ enum: TIPOS_SOLICITUD })
  @IsOptional() @IsEnum(TIPOS_SOLICITUD) tipo?: TipoSolicitud;

  @ApiPropertyOptional() @IsOptional() @IsMongoId() factura?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() empresaProveedora?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number = 20;
}
