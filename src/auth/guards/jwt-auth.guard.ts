import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

/**
 * Rutas permitidas mientras el usuario tiene mustChangePassword=true.
 * Son las ÚNICAS acciones que puede ejecutar hasta rotar la credencial temporal:
 * cambiar su password y leer su propio perfil. El resto se bloquea server-side.
 * El prefijo global `api/v1` se normaliza fuera de esta comparación (ver matchRutaPermitida).
 */
const RUTAS_PERMITIDAS_MUST_CHANGE: { method: string; path: string }[] = [
  { method: 'POST', path: '/auth/change-password' },
  { method: 'GET', path: '/auth/profile' },
];

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = any>(
    err: any,
    user: any,
    info: any,
    context: ExecutionContext,
  ): TUser {
    // Deja que el comportamiento estándar de Passport lance si no hay user/token válido.
    const result = super.handleRequest<TUser>(err, user, info, context);

    // ENFORCEMENT mustChangePassword (server-side): un JWT emitido para un usuario
    // con password temporal NO debe dar acceso a toda la API. Solo permitimos
    // cambiar la password y ver el perfil propio. El frontend NO es la barrera.
    if ((result as any)?.mustChangePassword) {
      const req = context.switchToHttp().getRequest<Request>();
      if (!this.matchRutaPermitida(req)) {
        throw new ForbiddenException({
          message:
            'Debés cambiar tu contraseña temporal antes de operar. ' +
            'Usá POST /auth/change-password.',
          code: 'MUST_CHANGE_PASSWORD',
        });
      }
    }

    return result;
  }

  private matchRutaPermitida(req: Request): boolean {
    const method = (req.method || '').toUpperCase();
    // req.path no incluye query; le quitamos el prefijo global api/v1 para comparar.
    const path = (req.path || req.url || '').replace(/^\/api\/v1/, '');
    return RUTAS_PERMITIDAS_MUST_CHANGE.some(
      (r) => r.method === method && r.path === path,
    );
  }
}
