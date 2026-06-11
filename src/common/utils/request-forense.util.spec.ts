import type { Request } from 'express';
import { extraerIp, extraerUserAgent } from './request-forense.util';

describe('request-forense util', () => {
  const req = (over: Partial<Request> = {}) =>
    ({ headers: {}, ...over }) as unknown as Request;

  describe('extraerIp', () => {
    it('prioriza CloudFront-Viewer-Address y le saca el puerto (IPv4)', () => {
      expect(
        extraerIp(
          req({ headers: { 'cloudfront-viewer-address': '203.0.113.5:443' } }),
        ),
      ).toBe('203.0.113.5');
    });

    it('soporta IPv6 con corchetes', () => {
      expect(
        extraerIp(
          req({
            headers: { 'cloudfront-viewer-address': '[2001:db8::1]:443' },
          }),
        ),
      ).toBe('2001:db8::1');
    });

    it('cae a req.ip si no hay header de CloudFront', () => {
      expect(extraerIp(req({ ip: '10.0.0.1' }))).toBe('10.0.0.1');
    });

    it("devuelve 'unknown' si no hay nada", () => {
      expect(extraerIp(req())).toBe('unknown');
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
