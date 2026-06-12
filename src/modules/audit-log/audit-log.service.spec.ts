import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'crypto';
import { AuditLogService } from './audit-log.service';
import { AuditLog } from './schemas/audit-log.schema';

/**
 * Regresión del hallazgo "Hash-chain del audit log sin secreto (SHA-256 plano, no HMAC)".
 *
 * Modelo de amenaza: un insider con acceso de ESCRITURA a la colección `audit_logs`
 * (DBA, credencial filtrada, host comprometido) edita un registro para borrar evidencia
 * y recomputa la cadena. Antes del fix la cadena era SHA-256 plano (keyless), con el
 * algoritmo público en el repo, así que el insider podía re-encadenar y `verifyChain`
 * la validaba como íntegra. Con HMAC el secreto vive fuera de la DB y el insider no lo tiene.
 */
describe('AuditLogService — integridad de la cadena (HMAC)', () => {
  const HMAC_KEY = 'a'.repeat(64);

  // ─── Fake model en memoria que imita la API de Mongoose usada por el service ──────
  type Doc = Partial<AuditLog> & { createdAt: Date };

  function buildFakeModel(store: Doc[]) {
    let seq = 0;
    return {
      // findOne(...).sort(...).select(...).lean()
      findOne: (filter: any) => {
        const sortRef: { dir: number } = { dir: -1 };
        const chain = {
          sort: (s: any) => {
            sortRef.dir = s.createdAt;
            return chain;
          },
          select: () => chain,
          lean: async () => {
            const matches = store
              .filter(
                (d) =>
                  d.entidad === filter.entidad &&
                  d.entidadId === filter.entidadId &&
                  d.hash != null,
              )
              .sort(
                (a, b) =>
                  (a.createdAt.getTime() - b.createdAt.getTime()) * sortRef.dir,
              );
            return matches[0] ?? null;
          },
        };
        return chain;
      },
      // find(...).sort(...).lean()
      find: (filter: any) => {
        const sortRef: { dir: number } = { dir: 1 };
        const chain = {
          sort: (s: any) => {
            sortRef.dir = s.createdAt;
            return chain;
          },
          lean: async () =>
            store
              .filter(
                (d) =>
                  d.entidad === filter.entidad &&
                  d.entidadId === filter.entidadId,
              )
              .sort(
                (a, b) =>
                  (a.createdAt.getTime() - b.createdAt.getTime()) * sortRef.dir,
              ),
        };
        return chain;
      },
      create: async (data: any) => {
        const doc: Doc = { ...data, createdAt: new Date(Date.now() + seq++) };
        store.push(doc);
        return doc;
      },
    };
  }

  async function buildService(hmacKey: string) {
    const store: Doc[] = [];
    const model = buildFakeModel(store);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: getModelToken(AuditLog.name), useValue: model },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'audit.hmacKey' ? hmacKey : undefined,
          },
        },
      ],
    }).compile();
    return {
      service: module.get<AuditLogService>(AuditLogService),
      store,
    };
  }

  // Replica el canonical del service (debe incluir el flag hmac).
  function canonical(e: Partial<AuditLog>): string {
    const entry: Record<string, any> = {
      usuario: e.usuario,
      usuarioEmail: e.usuarioEmail,
      accion: e.accion,
      entidad: e.entidad,
      entidadId: e.entidadId,
      cambios: e.cambios,
      ip: e.ip,
      userAgent: e.userAgent,
      descripcion: e.descripcion,
      hmac: !!e.hmac,
    };
    const ordered = Object.keys(entry)
      .filter((k) => entry[k] !== undefined)
      .sort()
      .reduce<Record<string, any>>((acc, k) => {
        acc[k] = entry[k];
        return acc;
      }, {});
    return JSON.stringify(ordered);
  }

  const sample = (over: Partial<AuditLog> = {}): any => ({
    usuario: 'u1',
    usuarioEmail: 'tesoreria@perc.com',
    accion: 'pagar',
    entidad: 'pago',
    entidadId: 'pago-1',
    cambios: { monto: 100000 },
    ip: '10.0.0.1',
    userAgent: 'jest',
    descripcion: 'pago fraudulento',
    ...over,
  });

  describe('con AUDIT_HMAC_KEY configurada', () => {
    it('sella cada entry con HMAC (no SHA-256 plano) y marca hmac=true', async () => {
      const { service, store } = await buildService(HMAC_KEY);
      await service.log(sample());

      const doc = store[0];
      expect(doc.hmac).toBe(true);

      const plano = createHash('sha256')
        .update('' + canonical({ ...doc, hmac: true }))
        .digest('hex');
      const hmac = createHmac('sha256', HMAC_KEY)
        .update('' + canonical({ ...doc, hmac: true }))
        .digest('hex');

      // El hash guardado NO es el SHA-256 plano (keyless) sino el HMAC con la clave.
      expect(doc.hash).not.toBe(plano);
      expect(doc.hash).toBe(hmac);
    });

    it('verifyChain valida una cadena legítima generada por el service', async () => {
      const { service } = await buildService(HMAC_KEY);
      await service.log(sample({ accion: 'crear' }));
      await service.log(sample({ accion: 'pagar' }));
      await service.log(sample({ accion: 'anular' }));

      const res = await service.verifyChain('pago', 'pago-1');
      expect(res.valid).toBe(true);
      expect(res.total).toBe(3);
    });

    // ─── EL ATAQUE: insider edita la DB y recomputa la cadena con SHA-256 plano ──────
    it('REGRESIÓN: un insider sin el secreto NO puede recomputar la cadena (SHA-256 plano)', async () => {
      const { service, store } = await buildService(HMAC_KEY);
      await service.log(sample({ accion: 'crear', cambios: { x: 1 } }));
      await service.log(sample({ accion: 'pagar', cambios: { monto: 999999 } }));
      await service.log(sample({ accion: 'anular', cambios: { motivo: 'ok' } }));

      // El insider edita la entry intermedia para borrar evidencia del pago fraudulento
      // y recomputa TODA la cadena con el algoritmo público (SHA-256 plano, sin secreto).
      store[1].cambios = { monto: 1 }; // falseado
      store[1].usuarioEmail = 'otro@perc.com';
      let prev = '';
      for (const d of store) {
        // El atacante intenta encadenar con SHA-256 plano (no tiene la AUDIT_HMAC_KEY).
        d.hmac = false; // intenta "downgradear" a plano
        d.hash = createHash('sha256')
          .update(prev + canonical({ ...d, hmac: false }))
          .digest('hex');
        prev = d.hash;
      }

      const res = await service.verifyChain('pago', 'pago-1');
      expect(res.valid).toBe(false);
      // Anti-downgrade: con una clave activa el verificador exige hmac=true en toda entry.
      // El insider intentó bajar la cadena a SHA-256 plano (lo único que puede recomputar sin
      // el secreto) y eso se detecta como tampering en la primera entry.
      expect(res.brokenAt).toBe(0);
      expect((res as any).motivo).toBe('downgrade-a-sha256-plano');
    });

    it('REGRESIÓN: el insider tampoco puede recomputar manteniendo hmac=true (no tiene la clave)', async () => {
      const { service, store } = await buildService(HMAC_KEY);
      await service.log(sample({ accion: 'crear', cambios: { x: 1 } }));
      await service.log(sample({ accion: 'pagar', cambios: { monto: 999999 } }));

      // El insider mantiene hmac=true (esquiva el anti-downgrade) y recomputa con una clave
      // adivinada, porque la real vive fuera de la DB.
      const claveAdivinada = 'c'.repeat(64);
      store[1].cambios = { monto: 1 };
      let prev = '';
      for (const d of store) {
        d.hmac = true;
        d.hash = createHmac('sha256', claveAdivinada)
          .update(prev + canonical({ ...d, hmac: true }))
          .digest('hex');
        prev = d.hash;
      }

      const res = await service.verifyChain('pago', 'pago-1');
      expect(res.valid).toBe(false);
      expect(res.brokenAt).toBe(0);
    });

    it('REGRESIÓN: el insider NO puede recomputar ni siquiera con HMAC porque no tiene la clave', async () => {
      const { service, store } = await buildService(HMAC_KEY);
      await service.log(sample({ accion: 'pagar', cambios: { monto: 999999 } }));

      // El insider conoce el algoritmo (HMAC-SHA256) pero usa una clave equivocada
      // (no tiene la AUDIT_HMAC_KEY real, que vive fuera de la DB).
      const claveAdivinada = 'b'.repeat(64);
      store[0].cambios = { monto: 1 };
      store[0].hmac = true;
      store[0].hash = createHmac('sha256', claveAdivinada)
        .update('' + canonical({ ...store[0], hmac: true }))
        .digest('hex');

      const res = await service.verifyChain('pago', 'pago-1');
      expect(res.valid).toBe(false);
      expect(res.brokenAt).toBe(0);
    });

    // ─── EL OTRO AGUJERO: borrar `hash` para que verifyChain haga `continue` ─────────
    it('REGRESIÓN: borrar el campo hash de una entry firmada ya NO la salta (no devuelve valid:true)', async () => {
      const { service, store } = await buildService(HMAC_KEY);
      await service.log(sample({ accion: 'crear' }));
      await service.log(sample({ accion: 'pagar', cambios: { monto: 999999 } }));

      // El insider borra el hash de la entry comprometida esperando que verifyChain la "saltee".
      store[1].cambios = { monto: 1 };
      delete store[1].hash;

      const res = await service.verifyChain('pago', 'pago-1');
      expect(res.valid).toBe(false);
      expect((res as any).motivo).toBe('entry-firmada-sin-hash');
    });

    it('REGRESIÓN: editar `cambios` sin tocar el hash rompe la verificación', async () => {
      const { service, store } = await buildService(HMAC_KEY);
      await service.log(sample({ accion: 'pagar', cambios: { monto: 999999 } }));

      store[0].cambios = { monto: 1 }; // editado, hash queda viejo

      const res = await service.verifyChain('pago', 'pago-1');
      expect(res.valid).toBe(false);
      expect(res.brokenAt).toBe(0);
    });
  });

  describe('verificación de entradas HMAC sin la clave presente', () => {
    it('no afirma integridad a ciegas: valid:false con motivo sin-clave', async () => {
      // 1) Se generan entradas CON la clave (firmadas HMAC).
      const { service: withKey, store } = await buildService(HMAC_KEY);
      await withKey.log(sample({ accion: 'pagar' }));

      // 2) Otro verificador (key perdida/rotada/no provista) opera sobre el MISMO store.
      const svcSinClave = await buildServiceConStore('', store);

      const res = await svcSinClave.verifyChain('pago', 'pago-1');
      expect(res.valid).toBe(false);
      expect((res as any).motivo).toBe('sin-clave-para-verificar-hmac');
    });
  });

  describe('compatibilidad: sin AUDIT_HMAC_KEY (dev, SHA-256 plano)', () => {
    it('sigue generando y validando la cadena (best-effort) y marca hmac=false', async () => {
      const { service, store } = await buildService('');
      await service.log(sample({ accion: 'crear' }));
      await service.log(sample({ accion: 'pagar' }));

      expect(store[0].hmac).toBe(false);
      const res = await service.verifyChain('pago', 'pago-1');
      expect(res.valid).toBe(true);
      expect(res.total).toBe(2);
    });

    it('entradas legacy sin hash (hmac=false) se saltean sin romper la cadena', async () => {
      const { service, store } = await buildService('');
      // Entry legacy pre-feature: sin hash ni flag hmac.
      store.push({
        usuario: 'u0',
        usuarioEmail: 'legacy@perc.com',
        accion: 'login',
        entidad: 'pago',
        entidadId: 'pago-1',
        createdAt: new Date(Date.now() - 1000),
      } as any);
      await service.log(sample({ accion: 'pagar' }));

      const res = await service.verifyChain('pago', 'pago-1');
      expect(res.valid).toBe(true);
      expect(res.sinHash).toBe(1);
    });
  });

  // Helper: construye un service sobre un store ya existente (para simular verificadores distintos).
  async function buildServiceConStore(hmacKey: string, store: Doc[]) {
    const model = buildFakeModel(store);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: getModelToken(AuditLog.name), useValue: model },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'audit.hmacKey' ? hmacKey : undefined,
          },
        },
      ],
    }).compile();
    return module.get<AuditLogService>(AuditLogService);
  }
});
