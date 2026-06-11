import { cifrar, descifrar } from './cifrado.util';

/**
 * Control de exposición y cifrado at-rest de datos bancarios (CBU).
 *
 * - Cifrado: el CBU se guarda cifrado (AES-256-GCM) si `CBU_ENC_KEY` está seteada.
 *   Coexistencia: valores planos (legacy / sin key) se devuelven tal cual, así la
 *   migración puede ser gradual y dev sin key sigue funcionando.
 * - Acceso: sólo los roles que ejecutan/autorizan pagos ven el CBU completo; el
 *   resto lo ve enmascarado (`****1234`). 'consulta' (solo lectura) lo ve enmascarado.
 */

const ROLES_VEN_CBU = ['admin', 'tesoreria', 'operador'];

export function puedeVerCbu(role?: string): boolean {
  return !!role && ROLES_VEN_CBU.includes(role);
}

function encKey(): string {
  return process.env.CBU_ENC_KEY || '';
}

/** Un valor cifrado tiene el formato `ivHex:tagHex:dataHex`. */
function pareceCifrado(v: string): boolean {
  const parts = v.split(':');
  return parts.length === 3 && parts.every((p) => /^[0-9a-f]+$/i.test(p));
}

/** Cifra un CBU plano si hay key. Idempotente: no re-cifra un valor ya cifrado. */
export function cifrarCbu(cbu?: string | null): string | undefined {
  if (!cbu) return cbu ?? undefined;
  const key = encKey();
  if (!key || pareceCifrado(cbu)) return cbu;
  return cifrar(cbu, key);
}

/** Descifra un CBU si está cifrado y hay key; si es plano o no hay key, lo devuelve igual. */
export function descifrarCbu(cbu?: string | null): string | undefined {
  if (!cbu) return cbu ?? undefined;
  const key = encKey();
  if (!key || !pareceCifrado(cbu)) return cbu;
  try {
    return descifrar(cbu, key);
  } catch {
    return cbu; // dato corrupto / key equivocada: no romper la respuesta
  }
}

function maskCbu(cbu?: string | null): string | undefined {
  if (!cbu) return cbu ?? undefined;
  return cbu.length <= 4 ? '****' : `****${cbu.slice(-4)}`;
}

function toPlain(emp: any): any {
  return typeof emp?.toObject === 'function' ? emp.toObject() : { ...emp };
}

/** Cifra el CBU dentro de un objeto datosBancarios (para escritura). No muta el original. */
export function cifrarDatosBancarios<T extends { cbu?: string } | undefined>(
  datos: T,
): T {
  if (!datos || !datos.cbu) return datos;
  return { ...datos, cbu: cifrarCbu(datos.cbu) } as T;
}

/** Copia de la empresa con el CBU DESCIFRADO (para roles que pueden verlo). */
export function revelarEmpresaBancarios(emp: any): any {
  if (!emp) return emp;
  const plain = toPlain(emp);
  if (plain.datosBancarios?.cbu) {
    plain.datosBancarios = {
      ...plain.datosBancarios,
      cbu: descifrarCbu(plain.datosBancarios.cbu),
    };
  }
  return plain;
}

/** Copia de la empresa con el CBU descifrado y luego ENMASCARADO (para roles sin acceso). */
export function enmascararEmpresaBancarios(emp: any): any {
  if (!emp) return emp;
  const plain = toPlain(emp);
  if (plain.datosBancarios?.cbu) {
    plain.datosBancarios = {
      ...plain.datosBancarios,
      cbu: maskCbu(descifrarCbu(plain.datosBancarios.cbu)),
    };
  }
  return plain;
}

/** Aplica revelar o enmascarar según el rol. */
export function prepararEmpresaBancarios(emp: any, role?: string): any {
  return puedeVerCbu(role)
    ? revelarEmpresaBancarios(emp)
    : enmascararEmpresaBancarios(emp);
}
