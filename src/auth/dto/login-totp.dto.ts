import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class LoginTotpDto {
  /** Challenge token devuelto por POST /auth/login (pre-2fa, corta vida). */
  @IsString()
  @IsNotEmpty()
  challengeToken: string;

  /** Código TOTP de 6 dígitos o un código de recuperación. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  codigo: string;
}
