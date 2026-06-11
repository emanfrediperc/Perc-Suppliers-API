import type { Request } from 'express';

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
 * IP real del cliente con precedencia: CloudFront-Viewer-Address (sin puerto) > req.ip > 'unknown'.
 * `req.ip` es confiable sólo si `trust proxy` está configurado (ver main.ts); detrás de
 * CloudFront el header Viewer-Address es la fuente de mayor fidelidad.
 */
export function extraerIp(req: Request): string {
  const cf = req.headers['cloudfront-viewer-address'];
  if (typeof cf === 'string' && cf.length > 0) {
    return stripPort(cf);
  }
  return req.ip ?? 'unknown';
}

/** User-Agent del request, o 'unknown' si está ausente. */
export function extraerUserAgent(req: Request): string {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' && ua.length > 0 ? ua : 'unknown';
}
