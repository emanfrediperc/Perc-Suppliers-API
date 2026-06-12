import {
  IsObject,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SetConfiguracionDto {
  @IsObject()
  @IsNotEmpty()
  valor: Record<string, any>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string;
}
