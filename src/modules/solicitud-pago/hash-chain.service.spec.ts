import { HashChainService } from './hash-chain.service';

describe('HashChainService', () => {
  const svc = new HashChainService();
  const u1 = '507f1f77bcf86cd799439011';
  const u2 = '507f1f77bcf86cd799439012';
  const t = (iso: string) => new Date(iso);

  function entry(over: Partial<any> = {}) {
    return {
      accion: 'crear',
      usuario: u1,
      estadoNuevo: 'pendiente',
      fecha: t('2026-05-05T10:00:00.000Z'),
      ...over,
    };
  }

  describe('computeHash', () => {
    it('returns a 64-char hex sha256', () => {
      const h = svc.computeHash('', entry());
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic — same input gives same hash', () => {
      const a = svc.computeHash('', entry());
      const b = svc.computeHash('', entry());
      expect(a).toBe(b);
    });

    it('depends on prevHash', () => {
      const a = svc.computeHash('aaa', entry());
      const b = svc.computeHash('bbb', entry());
      expect(a).not.toBe(b);
    });

    it('depends on accion', () => {
      const a = svc.computeHash('', entry({ accion: 'crear' }));
      const b = svc.computeHash('', entry({ accion: 'aprobar' }));
      expect(a).not.toBe(b);
    });

    it('depends on usuario', () => {
      const a = svc.computeHash('', entry({ usuario: u1 }));
      const b = svc.computeHash('', entry({ usuario: u2 }));
      expect(a).not.toBe(b);
    });

    it('ignores order of object keys (canonical sort)', () => {
      // Both objects have same data, just constructed in different field order
      const a = svc.computeHash('', { accion: 'crear', usuario: u1, estadoNuevo: 'pendiente', fecha: t('2026-05-05T10:00:00Z') });
      const b = svc.computeHash('', { fecha: t('2026-05-05T10:00:00Z'), estadoNuevo: 'pendiente', usuario: u1, accion: 'crear' });
      expect(a).toBe(b);
    });

    it('does NOT include hash/tsaToken/tsaError in the digest', () => {
      const base = entry();
      const a = svc.computeHash('', base);
      const b = svc.computeHash('', { ...base, hash: 'whatever', tsaToken: 'xxx', tsaError: 'yyy' });
      expect(a).toBe(b);
    });
  });

  describe('verifyChain', () => {
    function chainOf(entries: any[]) {
      let prev = '';
      return entries.map(e => {
        const hash = svc.computeHash(prev, e);
        prev = hash;
        return { ...e, hash };
      });
    }

    it('returns valid for an empty chain', () => {
      expect(svc.verifyChain([])).toEqual({ valid: true, brokenAt: null });
    });

    it('returns valid for a single entry chain', () => {
      const chain = chainOf([entry()]);
      expect(svc.verifyChain(chain)).toEqual({ valid: true, brokenAt: null });
    });

    it('returns valid for a multi-entry chain', () => {
      const chain = chainOf([
        entry({ accion: 'crear', estadoNuevo: 'pendiente' }),
        entry({ accion: 'aprobar', estadoAnterior: 'pendiente', estadoNuevo: 'en_proceso' }),
        entry({ accion: 'ejecutar', estadoAnterior: 'en_proceso', estadoNuevo: 'pago_en_proceso_perc' }),
        entry({ accion: 'procesar', estadoAnterior: 'pago_en_proceso_perc', estadoNuevo: 'procesado' }),
      ]);
      expect(svc.verifyChain(chain)).toEqual({ valid: true, brokenAt: null });
    });

    it('detects tampering on the first entry', () => {
      const chain = chainOf([entry(), entry({ accion: 'aprobar' })]);
      chain[0].estadoNuevo = 'trampa';
      const r = svc.verifyChain(chain);
      expect(r.valid).toBe(false);
      expect(r.brokenAt).toBe(0);
    });

    it('detects tampering on a middle entry', () => {
      const chain = chainOf([
        entry(),
        entry({ accion: 'aprobar' }),
        entry({ accion: 'ejecutar' }),
      ]);
      chain[1].motivo = 'editado a posteriori';
      const r = svc.verifyChain(chain);
      expect(r.valid).toBe(false);
      // chain[1] hash is invalid → brokenAt 1
      expect(r.brokenAt).toBe(1);
    });

    it('detects a swapped hash (replacing entry with older one)', () => {
      const chain = chainOf([entry(), entry({ accion: 'aprobar' })]);
      const tampered = [chain[0], chain[0]]; // duplicar primera entry
      const r = svc.verifyChain(tampered);
      expect(r.valid).toBe(false);
      expect(r.brokenAt).toBe(1);
    });
  });
});
