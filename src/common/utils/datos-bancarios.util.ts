import { Logger } from '@nestjs/common';
import { cifrar, descifrar } from './cifrado.util';

/**
 * Control de exposición y cifrado at-rest de datos bancarios (CBU).
 *
 * - Cifrado: el CBU se guarda cifrado (AES-256-GCM) si `CBU_ENC_KEY` está seteada.
 *   Coexistencia: valores planos (legacy / sin key) se devuelven tal cual, así la
 *   migración puede ser gradual y dev sin key sigue funcionando.
 * - Acceso: sólo los roles que ejecutan/autorizan pagos ven el CBU completo; el
 *   resto lo ve enmascarado (`****1234`). 'consulta' (solo lectura) lo ve enmascarado.
 * - Integridad: si un CBU cifrado falla la verificación del authTag de GCM (dato
 *   manipulado at-rest o key equivocada) NUNCA se devuelve el ciphertext crudo:
 *   se loguea como evento de seguridad y se devuelve un sentinel explícito.
 */

const logger = new Logger('DatosBancarios');

/** Sentinel devuelto cuando un CBU cifrado no supera la verificación de integridad (authTag). */
export const CBU_INVALIDO = '[CBU_INVALIDO]';

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

/**
 * Descifra un CBU si está cifrado y hay key; si es plano o no hay key, lo devuelve igual.
 *
 * Si el valor parece cifrado pero `descifrar()` lanza (authTag de GCM inválido =>
 * manipulación at-rest o key equivocada) NO se devuelve el ciphertext crudo: eso
 * anularía la única garantía de integridad que aporta GCM y filtraría el blob cifrado
 * a la respuesta/reporte. En su lugar se registra un evento de seguridad y se devuelve
 * un sentinel explícito (`CBU_INVALIDO`), de modo que el consumidor muestre un error
 * claro en vez de basura hexadecimal sin que la generación de reportes/PDF se rompa.
 */
export function descifrarCbu(cbu?: string | null): string | undefined {
  if (!cbu) return cbu ?? undefined;
  const key = encKey();
  if (!key || !pareceCifrado(cbu)) return cbu;
  try {
    return descifrar(cbu, key);
  } catch {
    // authTag inválido: posible tampering del CBU at-rest o key equivocada.
    // No devolver el ciphertext: loguear y señalizar con un sentinel.
    logger.error(
      'CBU cifrado con authTag inválido: posible manipulación at-rest o CBU_ENC_KEY equivocada. ' +
        'Se descarta el valor y se devuelve el sentinel CBU_INVALIDO.',
    );
    return CBU_INVALIDO;
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
    const descifrado = descifrarCbu(plain.datosBancarios.cbu);
    plain.datosBancarios = {
      ...plain.datosBancarios,
      // Un CBU corrupto no se enmascara: se propaga el sentinel como señal explícita.
      cbu: descifrado === CBU_INVALIDO ? CBU_INVALIDO : maskCbu(descifrado),
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
