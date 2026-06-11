import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

export interface GeoUbicacionResuelta {
  pais?: string;
  ciudad?: string;
}

/**
 * Resuelve país/ciudad de un request para enriquecer el rastro forense.
 *
 * Primario: headers que inyecta CloudFront (`CloudFront-Viewer-Country` /
 * `CloudFront-Viewer-City`) — gratis, sin base de datos que mantener.
 * Fallback: `undefined`. Queda el seam para enchufar MaxMind/`geoip-lite`
 * (lookup offline por IP) a futuro sin tocar los call sites. Nunca lanza.
 */
@Injectable()
export class GeoService {
  resolver(req: Request): GeoUbicacionResuelta | undefined {
    const pais = this.header(req, 'cloudfront-viewer-country');
    const ciudad = this.header(req, 'cloudfront-viewer-city');
    if (!pais && !ciudad) return undefined;
    return { pais, ciudad };
  }

  private header(req: Request, name: string): string | undefined {
    const v = req.headers[name];
    return typeof v === 'string' && v.length > 0 ? v : undefined;
  }
}
