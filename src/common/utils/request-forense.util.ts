import type { Request } from 'express';

/** Header (custom) que CloudFront inyecta con un secreto compartido para probar el origen. */
export const CLOUDFRONT_SECRET_HEADER = 'x-cloudfront-shared-secret';

/**
 * Quita el puerto de una dirección "ip:puerto" (formato de CloudFront-Viewer-Address).
 * Soporta IPv4 (`1.2.3.4:5678`) e IPv6 con corchetes (`[::1]:5678`).
 */
function stripPort(addr: string): string {
  if (addr.startsWith('[')) {
    const end = addr.indexOf(']');
    return end > 0 ? addr.slice(1, end) : addr;
  }
  const parts = addr.split(':');
  // IPv4 con puerto → un solo ':'. IPv6 crudo (varios ':') se devuelve tal cual.
  return parts.length === 2 ? parts[0] : addr;
}

/**
 * Comparación en tiempo constante de strings cortos (evita timing-oracle sobre el secreto).
 */
function secretosIguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * ¿El request entró realmente por CloudFront confiable? Sólo si trae el header de
 * secreto compartido con el valor esperado. Sin secreto configurado → NO confiable
 * (no se puede probar el origen, así que no confiamos en los headers Viewer-*).
 *
 * SEGURIDAD: el endpoint público de magic-link permite a cualquier cliente inyectar
 * `CloudFront-Viewer-Address`/`-Country`. Si confiáramos en ellos sin verificar el
 * origen, el atacante podría envenenar la IP/geo del rastro forense de no-repudio.
 */
export function vieneDeCloudFrontConfiable(
  req: Request,
  sharedSecret?: string,
): boolean {
  if (!sharedSecret) return false;
  const recibido = req.headers[CLOUDFRONT_SECRET_HEADER];
  return typeof recibido === 'string' && secretosIguales(recibido, sharedSecret);
}

/**
 * IP real del cliente. Confía en `CloudFront-Viewer-Address` (sin puerto) SÓLO si el
 * request probó venir de CloudFront (header de secreto compartido). En cualquier otro
 * caso usa `req.ip`, que Express resuelve con `trust proxy` (N hops acotados, ver main.ts)
 * y NO es spoofeable vía headers arbitrarios del cliente.
 */
export function extraerIp(req: Request, sharedSecret?: string): string {
  if (vieneDeCloudFrontConfiable(req, sharedSecret)) {
    const cf = req.headers['cloudfront-viewer-address'];
    if (typeof cf === 'string' && cf.length > 0) {
      return stripPort(cf);
    }
  }
  return req.ip ?? 'unknown';
}

/** User-Agent del request, o 'unknown' si está ausente. */
export function extraerUserAgent(req: Request): string {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' && ua.length > 0 ? ua : 'unknown';
}
