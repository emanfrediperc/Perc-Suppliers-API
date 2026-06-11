import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class VerificarStepUpDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @IsNotEmpty()
  desafioId: string;

  /** Contraseña del aprobador (MVP) o código TOTP de 6 dígitos. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  secreto: string;
}
