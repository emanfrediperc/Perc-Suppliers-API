import type { Request } from 'express';
import type { ConfigService } from '@nestjs/config';
import { GeoService } from './geo.service';
import { CLOUDFRONT_SECRET_HEADER } from '../utils/request-forense.util';

const SECRET = 'cf-secret-xyz';

/** ConfigService stub que devuelve el secreto compartido de CloudFront. */
const configConSecreto = {
  get: (k: string) =>
    k === 'forensics.cloudfrontSharedSecret' ? SECRET : undefined,
} as unknown as ConfigService;

describe('GeoService', () => {
  const svc = new GeoService(configConSecreto);
  // Request "desde CloudFront confiable": trae el header de secreto correcto.
  const reqWith = (headers: Record<string, unknown>) =>
    ({
      headers: { [CLOUDFRONT_SECRET_HEADER]: SECRET, ...headers },
    }) as unknown as Request;

  it('resuelve país y ciudad desde headers de CloudFront (origen verificado)', () => {
    const r = svc.resolver(
      reqWith({
        'cloudfront-viewer-country': 'AR',
        'cloudfront-viewer-city': 'Buenos Aires',
      }),
    );
    expect(r).toEqual({ pais: 'AR', ciudad: 'Buenos Aires' });
  });

  it('resuelve sólo país si no hay ciudad', () => {
    const r = svc.resolver(reqWith({ 'cloudfront-viewer-country': 'AR' }));
    expect(r).toEqual({ pais: 'AR', ciudad: undefined });
  });

  it('devuelve undefined si no hay headers de geo', () => {
    expect(svc.resolver(reqWith({}))).toBeUndefined();
  });

  it('no lanza ante headers no-string y los ignora', () => {
    expect(() =>
      svc.resolver(reqWith({ 'cloudfront-viewer-country': 123 })),
    ).not.toThrow();
    expect(
      svc.resolver(reqWith({ 'cloudfront-viewer-country': 123 })),
    ).toBeUndefined();
  });

  // ─── REGRESIÓN: poisoning del rastro forense via headers spoofeados ────────

  it('SEGURIDAD: IGNORA los headers de geo si el request NO probó venir de CloudFront', () => {
    // Sin el header de secreto, cualquier cliente podría inyectar geo falsa.
    const reqSinSecreto = {
      headers: {
        'cloudfront-viewer-country': 'RU',
        'cloudfront-viewer-city': 'Moscow',
      },
    } as unknown as Request;
    expect(svc.resolver(reqSinSecreto)).toBeUndefined();
  });

  it('SEGURIDAD: IGNORA la geo si el secreto compartido es incorrecto', () => {
    const reqSecretoMalo = {
      headers: {
        [CLOUDFRONT_SECRET_HEADER]: 'wrong',
        'cloudfront-viewer-country': 'RU',
      },
    } as unknown as Request;
    expect(svc.resolver(reqSecretoMalo)).toBeUndefined();
  });

  it('SEGURIDAD: sin secreto configurado, NUNCA confía en los headers de geo', () => {
    const svcSinConfig = new GeoService({
      get: () => undefined,
    } as unknown as ConfigService);
    const req = {
      headers: {
        [CLOUDFRONT_SECRET_HEADER]: SECRET,
        'cloudfront-viewer-country': 'AR',
      },
    } as unknown as Request;
    expect(svcSinConfig.resolver(req)).toBeUndefined();
  });
});
