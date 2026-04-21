import { IsEnum, IsOptional, IsMongoId, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PrestamoStatus } from '../enums/prestamo-status.enum';
import { Currency } from '../enums/currency.enum';
import { Vehicle } from '../enums/vehicle.enum';
import { BalanceCut } from '../enums/balance-cut.enum';

export class QueryPrestamosDto {
  @ApiPropertyOptional({ enum: PrestamoStatus })
  @IsOptional()
  @IsEnum(PrestamoStatus)
  status?: PrestamoStatus;

  @ApiPropertyOptional({ enum: Currency })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiPropertyOptional({ example: '65abc1234567890abcdef012' })
  @IsOptional()
  @IsMongoId()
  lenderId?: string;

  @ApiPropertyOptional({ example: '65abc1234567890abcdef013' })
  @IsOptional()
  @IsMongoId()
  borrowerId?: string;

  @ApiPropertyOptional({
    example: '65abc1234567890abcdef014',
    description: 'Matchea préstamos donde la empresa está como acreedor o deudor',
  })
  @IsOptional()
  @IsMongoId()
  empresaId?: string;

  @ApiPropertyOptional({ enum: Vehicle })
  @IsOptional()
  @IsEnum(Vehicle)
  vehicle?: Vehicle;

  @ApiPropertyOptional({ enum: BalanceCut })
  @IsOptional()
  @IsEnum(BalanceCut)
  balanceCut?: BalanceCut;

  @ApiPropertyOptional({ enum: ['xlsx', 'csv'], description: 'Formato de exportación (solo usado por /export)' })
  @IsOptional()
  @IsIn(['xlsx', 'csv'])
  formato?: string;
}
