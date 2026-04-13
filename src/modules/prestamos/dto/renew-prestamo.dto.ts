import { IsEnum, IsNumber, IsDateString, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Vehicle } from '../enums/vehicle.enum';

export class RenewPrestamoDto {
  @ApiPropertyOptional({ example: 1200000, description: 'Si omitido, se calcula como capital + interés acumulado' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  capital?: number;

  @ApiPropertyOptional({ example: 48 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  rate?: number;

  @ApiPropertyOptional({ example: '2026-07-10' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ example: '2026-10-10' })
  @IsDateString()
  dueDate: string;

  @ApiPropertyOptional({ enum: Vehicle })
  @IsOptional()
  @IsEnum(Vehicle)
  vehicle?: Vehicle;
}
