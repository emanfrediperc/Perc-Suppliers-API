/**
 * Unit tests para RolesGuard (fail-closed).
 * El guard antes hacia `return true` cuando un endpoint no declaraba @Roles, dejando
 * pasar a cualquier autenticado. Ahora es fail-closed: sin @Roles -> ForbiddenException.
 */
import { ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  const ctx = (user: any): ExecutionContext =>
    ({
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', url: '/x', originalUrl: '/x', user }),
      }),
    }) as any;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
    // Silenciar el Logger.error del fail-closed para no ensuciar la salida de tests.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('FAIL-CLOSED: lanza ForbiddenException si el endpoint no declara @Roles', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(() => guard.canActivate(ctx({ role: 'admin' }))).toThrow(
      ForbiddenException,
    );
  });

  it('FAIL-CLOSED: lanza ForbiddenException si @Roles es un array vacio', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    expect(() => guard.canActivate(ctx({ role: 'admin' }))).toThrow(
      ForbiddenException,
    );
  });

  it('permite si el rol del user esta en @Roles', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin', 'tesoreria']);
    expect(guard.canActivate(ctx({ role: 'tesoreria' }))).toBe(true);
  });

  it('deniega si el rol del user NO esta en @Roles', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    expect(guard.canActivate(ctx({ role: 'consulta' }))).toBe(false);
  });

  it('deniega si no hay user en el request', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    expect(guard.canActivate(ctx(undefined))).toBe(false);
  });
});
