import { IsDateString, IsEnum, IsInt, IsMongoId, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ModalidadCompra } from '../enums/modalidad-compra.enum';
import { EstadoCompraMonedaExtranjera } from '../enums/estado-compra.enum';

export class QueryComprasMonedaExtranjeraDto {
  @ApiPropertyOptional({ enum: ModalidadCompra })
  @IsOptional()
  @IsEnum(ModalidadCompra)
  modalidad?: ModalidadCompra;

  @ApiPropertyOptional({ enum: EstadoCompraMonedaExtranjera })
  @IsOptional()
  @IsEnum(EstadoCompraMonedaExtranjera)
  estado?: EstadoCompraMonedaExtranjera;

  @ApiPropertyOptional({ example: '65abc1234567890abcdef012' })
  @IsOptional()
  @IsMongoId()
  empresaId?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  fechaDesde?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  fechaHasta?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
