import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EjecutarCompraMonedaExtranjeraDto {
  @ApiProperty({ example: '2026-04-18' })
  @IsDateString()
  fechaEjecutada: string;

  @ApiPropertyOptional({ example: 'Confirmación bróker #12345' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;
}
