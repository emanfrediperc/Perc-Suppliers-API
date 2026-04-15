import {
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ModalidadCompra } from '../enums/modalidad-compra.enum';

export class CreateCompraMonedaExtranjeraDto {
  @ApiProperty({ example: '2026-04-14' })
  @IsDateString()
  fecha: string;

  @ApiProperty({ enum: ModalidadCompra, example: ModalidadCompra.CABLE })
  @IsEnum(ModalidadCompra)
  modalidad: ModalidadCompra;

  @ApiProperty({ example: '65abc1234567890abcdef012' })
  @IsMongoId()
  empresaClienteId: string;

  @ApiProperty({ example: 10000 })
  @IsNumber()
  @Min(0.01)
  montoUSD: number;

  @ApiProperty({ example: 1250 })
  @IsNumber()
  @Min(0.0001)
  tipoCambio: number;

  @ApiProperty({ example: 12500000 })
  @IsNumber()
  @Min(0)
  montoARS: number;

  @ApiProperty({ example: 'Banco Nación' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  contraparte: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  comision?: number;

  @ApiPropertyOptional({ example: 'OP-2026-001' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referencia?: string;

  @ApiPropertyOptional({ example: 'Compra para cancelación de deuda' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;
}
