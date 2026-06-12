import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

/**
 * Step-up por JWT: la aprobación viene del :id de la URL y el aprobador del Bearer.
 * Sólo se envía el desafío y el secreto (password del aprobador o código TOTP).
 */
export class VerificarStepUpJwtDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  desafioId: string;

  /** Contraseña del aprobador (MVP) o código TOTP de 6 dígitos. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  secreto: string;
}
