import type { Request } from 'express';
import { GeoService } from './geo.service';

describe('GeoService', () => {
  const svc = new GeoService();
  const reqWith = (headers: Record<string, unknown>) =>
    ({ headers }) as unknown as Request;

  it('resuelve país y ciudad desde headers de CloudFront', () => {
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
});
