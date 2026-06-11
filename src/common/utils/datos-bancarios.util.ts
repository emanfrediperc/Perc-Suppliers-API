/**
 * Control de exposición de datos bancarios (CBU). Solo los roles que ejecutan o
 * autorizan pagos ven el CBU completo; el resto lo ve enmascarado (`****1234`).
 */

// Roles que ejecutan/autorizan pagos y necesitan el CBU completo.
// 'consulta' (solo lectura) lo ve enmascarado.
const ROLES_VEN_CBU = ['admin', 'tesoreria', 'operador'];

export function puedeVerCbu(role?: string): boolean {
  return !!role && ROLES_VEN_CBU.includes(role);
}

function maskCbu(cbu?: string | null): string | undefined {
  if (!cbu) return cbu ?? undefined;
  return cbu.length <= 4 ? '****' : `****${cbu.slice(-4)}`;
}

/**
 * Devuelve una copia (objeto plano) de la empresa con el CBU enmascarado.
 * Acepta un documento Mongoose o un objeto plano. No muta el original.
 */
export function enmascararEmpresaBancarios(emp: any): any {
  if (!emp) return emp;
  const plain =
    typeof emp.toObject === 'function' ? emp.toObject() : { ...emp };
  if (plain.datosBancarios?.cbu) {
    plain.datosBancarios = {
      ...plain.datosBancarios,
      cbu: maskCbu(plain.datosBancarios.cbu),
    };
  }
  return plain;
}
