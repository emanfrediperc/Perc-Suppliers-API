import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ProcesarSolicitudPagoDto {
  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  retencionIIBB?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  retencionGanancias?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  retencionIVA?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  retencionSUSS?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  otrasRetenciones?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() referenciaPago?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() observaciones?: string;
}
