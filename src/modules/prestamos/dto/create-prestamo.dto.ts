import { IsEnum, IsNumber, IsDateString, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { EmpresaRefDto } from './empresa-ref.dto';
import { Currency } from '../enums/currency.enum';
import { Vehicle } from '../enums/vehicle.enum';
import { BalanceCut } from '../enums/balance-cut.enum';

export class CreatePrestamoDto {
  @ApiProperty({ type: EmpresaRefDto })
  @ValidateNested()
  @Type(() => EmpresaRefDto)
  lender: EmpresaRefDto;

  @ApiProperty({ type: EmpresaRefDto })
  @ValidateNested()
  @Type(() => EmpresaRefDto)
  borrower: EmpresaRefDto;

  @ApiProperty({ enum: Currency, example: Currency.ARS })
  @IsEnum(Currency)
  currency: Currency;

  @ApiProperty({ example: 1000000 })
  @IsNumber()
  @Min(1)
  capital: number;

  @ApiProperty({ example: 45 })
  @IsNumber()
  @Min(0)
  rate: number;

  @ApiProperty({ example: '2026-04-10' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-07-10' })
  @IsDateString()
  dueDate: string;

  @ApiProperty({ enum: Vehicle, example: Vehicle.PAGARE })
  @IsEnum(Vehicle)
  vehicle: Vehicle;

  @ApiProperty({ enum: BalanceCut, example: BalanceCut.DEC })
  @IsEnum(BalanceCut)
  balanceCut: BalanceCut;
}
