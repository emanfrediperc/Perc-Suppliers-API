import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();

    // FAIL-CLOSED: un endpoint cubierto por RolesGuard que no declara @Roles es un
    // error de configuracion, no una via libre. Antes (`return true`) cualquier
    // autenticado pasaba. Ahora se bloquea y se deja rastro para detectar el handler
    // mal configurado en vez de que falle silenciosamente.
    if (!requiredRoles || requiredRoles.length === 0) {
      this.logger.error(
        `Endpoint sin @Roles bajo RolesGuard: ${request.method} ${
          request.originalUrl ?? request.url
        }. Acceso denegado (fail-closed).`,
      );
      throw new ForbiddenException(
        'Endpoint sin autorizacion de roles configurada',
      );
    }

    const user = request.user;
    return !!user && requiredRoles.includes(user.role);
  }
}
