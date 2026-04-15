import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AnularCompraMonedaExtranjeraDto {
  @ApiPropertyOptional({ example: 'Operación duplicada' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}
