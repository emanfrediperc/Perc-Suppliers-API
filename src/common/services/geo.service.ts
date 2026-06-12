import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { vieneDeCloudFrontConfiable } from '../utils/request-forense.util';

export interface GeoUbicacionResuelta {
  pais?: string;
  ciudad?: string;
}

/**
 * Resuelve país/ciudad de un request para enriquecer el rastro forense.
 *
 * Primario: headers que inyecta CloudFront (`CloudFront-Viewer-Country` /
 * `CloudFront-Viewer-City`). SEGURIDAD: sólo se confían si el request probó venir
 * de CloudFront (header de secreto compartido). Sin esa prueba de origen se ignoran
 * — en el endpoint público de magic-link, un cliente podría inyectarlos y envenenar
 * la geo del rastro forense de no-repudio.
 * Fallback: `undefined`. Queda el seam para enchufar MaxMind/`geoip-lite`
 * (lookup offline por IP) a futuro sin tocar los call sites. Nunca lanza.
 */
@Injectable()
export class GeoService {
  constructor(private readonly config?: ConfigService) {}

  resolver(req: Request): GeoUbicacionResuelta | undefined {
    const sharedSecret = this.config?.get<string>(
      'forensics.cloudfrontSharedSecret',
    );
    if (!vieneDeCloudFrontConfiable(req, sharedSecret)) return undefined;

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
