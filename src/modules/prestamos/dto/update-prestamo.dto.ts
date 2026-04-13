import { IsEnum, IsNumber, IsDateString, IsOptional, IsString, IsNotEmpty, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Vehicle } from '../enums/vehicle.enum';

export class UpdatePrestamoDto {
  @ApiPropertyOptional({ example: 1200000 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  capital?: number;

  @ApiPropertyOptional({ example: 48 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  rate?: number;

  @ApiPropertyOptional({ example: '2026-08-10' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ enum: Vehicle })
  @IsOptional()
  @IsEnum(Vehicle)
  vehicle?: Vehicle;

  @ApiProperty({ example: 'Ajuste de capital por acuerdo de partes' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
