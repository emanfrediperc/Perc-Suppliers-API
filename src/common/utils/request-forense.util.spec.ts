import type { Request } from 'express';
import {
  extraerIp,
  extraerUserAgent,
  vieneDeCloudFrontConfiable,
  CLOUDFRONT_SECRET_HEADER,
} from './request-forense.util';

const SECRET = 'cf-shared-secret';

describe('request-forense util', () => {
  const req = (over: Partial<Request> = {}) =>
    ({ headers: {}, ...over }) as unknown as Request;

  describe('extraerIp', () => {
    it('usa CloudFront-Viewer-Address (sin puerto) SOLO con secreto correcto (IPv4)', () => {
      expect(
        extraerIp(
          req({
            headers: {
              [CLOUDFRONT_SECRET_HEADER]: SECRET,
              'cloudfront-viewer-address': '203.0.113.5:443',
            },
            ip: '10.0.0.1',
          }),
          SECRET,
        ),
      ).toBe('203.0.113.5');
    });

    it('soporta IPv6 con corchetes (origen verificado)', () => {
      expect(
        extraerIp(
          req({
            headers: {
              [CLOUDFRONT_SECRET_HEADER]: SECRET,
              'cloudfront-viewer-address': '[2001:db8::1]:443',
            },
          }),
          SECRET,
        ),
      ).toBe('2001:db8::1');
    });

    it('cae a req.ip si no hay header de CloudFront', () => {
      expect(extraerIp(req({ ip: '10.0.0.1' }), SECRET)).toBe('10.0.0.1');
    });

    it("devuelve 'unknown' si no hay nada", () => {
      expect(extraerIp(req())).toBe('unknown');
    });

    // ─── REGRESIÓN: spoofing de IP forense via header CloudFront-Viewer-* ─────

    it('SEGURIDAD: IGNORA cloudfront-viewer-address y usa req.ip si NO hay secreto', () => {
      // Atacante en el endpoint público inyecta el header pero no puede probar el origen.
      expect(
        extraerIp(
          req({
            headers: { 'cloudfront-viewer-address': '200.40.10.10:443' },
            ip: '8.8.8.8',
          }),
        ),
      ).toBe('8.8.8.8');
    });

    it('SEGURIDAD: IGNORA el header si el secreto compartido es incorrecto', () => {
      expect(
        extraerIp(
          req({
            headers: {
              [CLOUDFRONT_SECRET_HEADER]: 'wrong',
              'cloudfront-viewer-address': '200.40.10.10:443',
            },
            ip: '8.8.8.8',
          }),
          SECRET,
        ),
      ).toBe('8.8.8.8');
    });
  });

  describe('vieneDeCloudFrontConfiable', () => {
    it('true sólo con header de secreto correcto', () => {
      expect(
        vieneDeCloudFrontConfiable(
          req({ headers: { [CLOUDFRONT_SECRET_HEADER]: SECRET } }),
          SECRET,
        ),
      ).toBe(true);
    });

    it('false sin secreto configurado', () => {
      expect(
        vieneDeCloudFrontConfiable(
          req({ headers: { [CLOUDFRONT_SECRET_HEADER]: SECRET } }),
          '',
        ),
      ).toBe(false);
    });

    it('false con secreto incorrecto', () => {
      expect(
        vieneDeCloudFrontConfiable(
          req({ headers: { [CLOUDFRONT_SECRET_HEADER]: 'nope' } }),
          SECRET,
        ),
      ).toBe(false);
    });
  });

  describe('extraerUserAgent', () => {
    it('devuelve el user-agent', () => {
      expect(
        extraerUserAgent(req({ headers: { 'user-agent': 'Mozilla/5.0' } })),
      ).toBe('Mozilla/5.0');
    });

    it("devuelve 'unknown' si falta", () => {
      expect(extraerUserAgent(req())).toBe('unknown');
    });
  });
});
