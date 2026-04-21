import { IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class EstimarEjecucionCompraMonedaExtranjeraDto {
  @ApiProperty({ example: '2026-04-18' })
  @IsDateString()
  fechaEstimadaEjecucion: string;
}
