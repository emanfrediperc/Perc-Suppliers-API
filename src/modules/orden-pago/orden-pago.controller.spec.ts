/**
 * Regresion seguridad (cluster pagos-mass-assign):
 * Los endpoints de lectura (findAll/export/findOne) ahora declaran @Roles
 * explicitos. Antes carecian de @Roles y, por el fail-open del RolesGuard
 * (`if (!requiredRoles) return true`), quedaban accesibles a cualquier rol
 * autenticado — incluido 'aprobador', que el diseño excluye de esas vistas.
 */
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { OrdenPagoController } from './orden-pago.controller';

describe('OrdenPagoController — @Roles en endpoints de lectura (regresion)', () => {
  const reflector = new Reflector();

  const roles = (handler: any): string[] | undefined =>
    reflector.get<string[]>(ROLES_KEY, handler);

  it.each(['findAll', 'export', 'findOne'])(
    'GET %s declara @Roles (no fail-open)',
    (metodo) => {
      const r = roles((OrdenPagoController.prototype as any)[metodo]);
      expect(r).toBeDefined();
      expect(Array.isArray(r)).toBe(true);
      expect(r!.length).toBeGreaterThan(0);
    },
  );

  it.each(['findAll', 'export', 'findOne'])(
    'GET %s NO expone la vista al rol aprobador',
    (metodo) => {
      const r = roles((OrdenPagoController.prototype as any)[metodo]);
      expect(r).not.toContain('aprobador');
    },
  );
});
