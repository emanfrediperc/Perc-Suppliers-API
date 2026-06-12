import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

/**
 * Body del POST /aprobaciones/contexto-token. El token viaja en el body (no en el
 * path/query) para que no quede en access logs, historial del navegador ni headers
 * Referer. MaxLength acota el payload sin recortar el token base64url real.
 */
export class ContextoTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token: string;
}
