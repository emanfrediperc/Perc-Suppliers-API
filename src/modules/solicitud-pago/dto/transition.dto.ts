import { IsOptional, IsString, IsDateString, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AprobarDto {
  @ApiPropertyOptional() @IsOptional() @IsString() motivo?: string;
}

export class EjecutarDto {
  @ApiPropertyOptional() @IsOptional() @IsString() motivo?: string;
}

export class CancelarDto {
  @ApiProperty() @IsString() @IsNotEmpty() motivo: string;
}

export class ReagendarDto {
  @ApiProperty() @IsDateString() @IsNotEmpty() nuevaFecha: string;
  @ApiPropertyOptional() @IsOptional() @IsString() motivo?: string;
}
