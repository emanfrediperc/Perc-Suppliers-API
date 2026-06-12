import { IsString, IsNotEmpty, IsOptional, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Re-autenticación obligatoria para que el PROPIO usuario apague su 2FA.
 * Apagar el TOTP es un downgrade de seguridad: un access token robado no debe
 * alcanzar para deshabilitar el segundo factor de la víctima. Por eso exigimos
 * la contraseña actual (y, si el usuario tiene TOTP enrolado, un código válido).
 */
export class RevocarTotpDto {
  @ApiProperty({ description: 'Contraseña actual del usuario (re-auth).' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({
    required: false,
    description:
      'Código TOTP (6 dígitos) o código de recuperación. Requerido si el usuario tiene 2FA activo.',
  })
  @IsOptional()
  @IsString()
  @Length(6, 16)
  codigo?: string;
}
