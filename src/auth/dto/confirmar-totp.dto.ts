import { IsString, IsNotEmpty, Length } from 'class-validator';

export class ConfirmarTotpDto {
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  codigo: string;
}
