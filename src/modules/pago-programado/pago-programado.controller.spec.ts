/**
 * Regresion seguridad (cluster pagos-mass-assign):
 * Los endpoints de lectura (findAll/getProximos/export/findOne) ahora declaran
 * @Roles explicitos. Antes carecian de @Roles y, por el fail-open del RolesGuard,
 * quedaban accesibles a cualquier rol autenticado (incluido 'aprobador').
 */
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { PagoProgramadoController } from './pago-programado.controller';

describe('PagoProgramadoController — @Roles en endpoints de lectura (regresion)', () => {
  const reflector = new Reflector();

  const roles = (handler: any): string[] | undefined =>
    reflector.get<string[]>(ROLES_KEY, handler);

  it.each(['findAll', 'getProximos', 'export', 'findOne'])(
    'GET %s declara @Roles (no fail-open)',
    (metodo) => {
      const r = roles((PagoProgramadoController.prototype as any)[metodo]);
      expect(r).toBeDefined();
      expect(Array.isArray(r)).toBe(true);
      expect(r!.length).toBeGreaterThan(0);
    },
  );

  it.each(['findAll', 'getProximos', 'export', 'findOne'])(
    'GET %s NO expone la vista al rol aprobador',
    (metodo) => {
      const r = roles((PagoProgramadoController.prototype as any)[metodo]);
      expect(r).not.toContain('aprobador');
    },
  );
});
