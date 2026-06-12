import {
  ForbiddenException,
  UnauthorizedException,
  ExecutionContext,
} from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * REGRESIÓN #6 — mustChangePassword enforced server-side.
 * Un JWT emitido para un usuario con password temporal NO debe dar acceso a toda
 * la API: sólo a POST /auth/change-password y GET /auth/profile.
 */
describe('JwtAuthGuard (mustChangePassword)', () => {
  const guard = new JwtAuthGuard();

  const ctx = (method: string, path: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ method, path, url: path, headers: {} }),
      }),
    }) as unknown as ExecutionContext;

  const user = (over: Record<string, any> = {}) => ({
    userId: 'u1',
    email: 'x@p.com',
    role: 'operador',
    mustChangePassword: false,
    ...over,
  });

  it('deja pasar a un usuario normal (mustChangePassword=false) en cualquier ruta', () => {
    const res = guard.handleRequest(
      null,
      user(),
      null,
      ctx('POST', '/api/v1/ordenes-pago'),
    );
    expect((res as any).userId).toBe('u1');
  });

  it('SEGURIDAD: bloquea (403) a un usuario con password temporal en endpoints de negocio', () => {
    expect(() =>
      guard.handleRequest(
        null,
        user({ mustChangePassword: true }),
        null,
        ctx('POST', '/api/v1/ordenes-pago/123/pagar'),
      ),
    ).toThrow(ForbiddenException);
  });

  it('SEGURIDAD: bloquea aunque el path NO tenga el prefijo api/v1', () => {
    expect(() =>
      guard.handleRequest(
        null,
        user({ mustChangePassword: true }),
        null,
        ctx('PATCH', '/aprobaciones/abc/decidir'),
      ),
    ).toThrow(ForbiddenException);
  });

  it('permite POST /auth/change-password con password temporal', () => {
    const res = guard.handleRequest(
      null,
      user({ mustChangePassword: true }),
      null,
      ctx('POST', '/api/v1/auth/change-password'),
    );
    expect((res as any).userId).toBe('u1');
  });

  it('permite GET /auth/profile con password temporal', () => {
    const res = guard.handleRequest(
      null,
      user({ mustChangePassword: true }),
      null,
      ctx('GET', '/api/v1/auth/profile'),
    );
    expect((res as any).userId).toBe('u1');
  });

  it('SEGURIDAD: no permite otros endpoints de /auth (ej. DELETE /auth/totp)', () => {
    expect(() =>
      guard.handleRequest(
        null,
        user({ mustChangePassword: true }),
        null,
        ctx('DELETE', '/api/v1/auth/totp'),
      ),
    ).toThrow(ForbiddenException);
  });

  it('respeta el comportamiento estándar: lanza si no hay user/token válido', () => {
    expect(() =>
      guard.handleRequest(
        null,
        false,
        null,
        ctx('GET', '/api/v1/auth/profile'),
      ),
    ).toThrow(UnauthorizedException);
  });
});
