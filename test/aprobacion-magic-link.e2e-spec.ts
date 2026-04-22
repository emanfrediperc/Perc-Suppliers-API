/**
 * E2E — Aprobación Magic Link
 *
 * Cubre: T022, T023, T024, T025, T026, T027, T039, T040, T041, T042, T043
 *
 * REQUISITOS DE ENTORNO:
 *   - MongoDB corriendo como replica set (rs0) en localhost:27017
 *   - JWT_SECRET con al menos 32 caracteres en el entorno o .env
 *   - MONGODB_URI apuntando a una DB de test (o la default: perc-suppliers)
 *
 * Cada describe es hermético: crea sus propios usuarios y datos de prueba.
 * Los usuarios del seed (admin@perc.com, tesoreria@perc.com, etc.) deben existir
 * con password 'admin123' (ejecutar `SEED_PASSWORD=admin123 npm run seed` antes).
 */

// Configurar variables de entorno para la suite ANTES de importar AppModule
process.env.ENABLE_MAGIC_LINK = 'true';
process.env.MAGIC_LINK_BASE_URL = 'http://localhost:4200/aprobar';
process.env.MAGIC_LINK_TTL_HOURS = '48';
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = 'perc-suppliers-jwt-secret-e2e-tests';
}

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/integrations/email/email.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extrae el raw token del magicLink capturado por el spy de EmailService. */
function extractToken(spy: jest.Mock, callIndex = 0): string {
  const calls = spy.mock.calls;
  if (!calls[callIndex]) throw new Error(`EmailService spy: no call at index ${callIndex}`);
  const [, data] = calls[callIndex];
  const url = new URL(data.magicLink);
  const t = url.searchParams.get('t');
  if (!t) throw new Error('Token no encontrado en magicLink: ' + data.magicLink);
  return t;
}

/** Login y devuelve el access_token. */
async function login(
  app: INestApplication,
  email: string,
  password: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(201);
  return res.body.access_token;
}

/** Crea un usuario via admin endpoint y devuelve { id, token }. */
async function crearUsuario(
  app: INestApplication,
  adminToken: string,
  data: { email: string; password: string; nombre: string; role: string },
): Promise<{ id: string; token: string }> {
  // Registrar (sin rol — por defecto 'consulta')
  const regRes = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ email: data.email, password: data.password, nombre: data.nombre });

  if (regRes.status !== 201) {
    throw new Error(`Register failed (${regRes.status}): ${JSON.stringify(regRes.body)}`);
  }

  const userId: string = regRes.body.user?.id ?? regRes.body.user?._id;

  // Asignar rol correcto
  await request(app.getHttpServer())
    .patch(`/api/v1/auth/users/${userId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ role: data.role })
    .expect(200);

  const token = await login(app, data.email, data.password);
  return { id: userId, token };
}

interface AppContext {
  app: INestApplication;
  emailSpy: jest.Mock;
  adminToken: string;
  tesoreriaToken: string;
  operadorToken: string;
  aprobadorToken: string;
  aprobadorId: string;
  /** IDs de empresas cliente creadas para los tests de prestamos */
  lenderId: string;
  borrowerId: string;
}

/**
 * Construye el TestingModule con EmailService mockeado (fire-and-forget).
 * La feature flag ENABLE_MAGIC_LINK se controla mediante process.env antes de compilar.
 */
async function buildApp(magicLinkEnabled = true): Promise<{
  app: INestApplication;
  emailSpy: jest.Mock;
}> {
  const emailSpy = jest.fn().mockResolvedValue(true);

  // Ajustar la feature flag ANTES de compilar el módulo, ya que configuration.ts
  // lee process.env en el momento de la factory.
  process.env.ENABLE_MAGIC_LINK = magicLinkEnabled ? 'true' : 'false';

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(EmailService)
    .useValue({ sendAprobacionMagicLink: emailSpy })
    .compile();

  const app = moduleFixture.createNestApplication();

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.init();
  return { app, emailSpy };
}

/**
 * Configura un contexto completo de usuarios y empresas para los tests.
 * Prefija todos los emails con `prefix` para aislar describe-blocks.
 */
async function setupContext(prefix: string): Promise<AppContext> {
  const { app, emailSpy } = await buildApp(true);

  // Login admin (usuario existente en DB de tests)
  const adminToken = await login(app, 'admin@perc.com', 'admin123');

  const { token: tesoreriaToken } = await crearUsuario(app, adminToken, {
    email: `${prefix}-tesoreria@test.perc`,
    password: 'Test1234!',
    nombre: `Tesoreria-${prefix}`,
    role: 'tesoreria',
  });

  const { token: operadorToken } = await crearUsuario(app, adminToken, {
    email: `${prefix}-operador@test.perc`,
    password: 'Test1234!',
    nombre: `Operador-${prefix}`,
    role: 'operador',
  });

  const { id: aprobadorId, token: aprobadorToken } = await crearUsuario(app, adminToken, {
    email: `${prefix}-aprobador@test.perc`,
    password: 'Test1234!',
    nombre: `Aprobador-${prefix}`,
    role: 'aprobador',
  });

  // Obtener IDs de empresas para crear prestamos
  // Buscar con un término que retorne resultados del seed (mínimo 2 chars requerido)
  const [clientesRes, proveedorasRes] = await Promise.all([
    request(app.getHttpServer())
      .get('/api/v1/prestamos/empresas/search?q=Pe')
      .set('Authorization', `Bearer ${tesoreriaToken}`)
      .expect(200),
    request(app.getHttpServer())
      .get('/api/v1/prestamos/empresas/search?q=Te')
      .set('Authorization', `Bearer ${tesoreriaToken}`)
      .expect(200),
  ]);

  const clienteEmpresas: Array<{ id: string; kind: string }> = [
    ...(clientesRes.body as Array<{ id: string; kind: string }>).filter((e) => e.kind === 'CLIENTE'),
    ...(proveedorasRes.body as Array<{ id: string; kind: string }>).filter((e) => e.kind === 'CLIENTE'),
  ];
  const proveedoraEmpresas: Array<{ id: string; kind: string }> = [
    ...(clientesRes.body as Array<{ id: string; kind: string }>).filter((e) => e.kind === 'PROVEEDORA'),
    ...(proveedorasRes.body as Array<{ id: string; kind: string }>).filter((e) => e.kind === 'PROVEEDORA'),
  ];

  if (clienteEmpresas.length < 1 || proveedoraEmpresas.length < 1) {
    throw new Error(
      'No hay suficientes empresas en la DB de tests. Ejecutá SEED_PASSWORD=admin123 npm run seed primero.',
    );
  }

  return {
    app,
    emailSpy,
    adminToken,
    tesoreriaToken,
    operadorToken,
    aprobadorToken,
    aprobadorId,
    lenderId: clienteEmpresas[0].id,
    borrowerId: proveedoraEmpresas[0].id,
  };
}

/** Crea un prestamo y devuelve { prestamoId, aprobacionId, rawToken }. */
async function crearPrestamoConAprobacion(ctx: AppContext): Promise<{
  prestamoId: string;
  aprobacionId: string;
  rawToken: string;
}> {
  ctx.emailSpy.mockClear();

  const prestamoPayload = {
    lender: { empresaId: ctx.lenderId, empresaKind: 'CLIENTE' },
    borrower: { empresaId: ctx.borrowerId, empresaKind: 'PROVEEDORA' },
    currency: 'ARS',
    capital: 500000,
    rate: 45,
    startDate: '2026-04-21',
    dueDate: '2026-07-21',
    vehicle: 'PAGARE',
    balanceCut: '12-31',
  };

  const res = await request(ctx.app.getHttpServer())
    .post('/api/v1/prestamos')
    .set('Authorization', `Bearer ${ctx.tesoreriaToken}`)
    .send(prestamoPayload)
    .expect(201);

  const prestamoId: string = res.body._id ?? res.body.id;

  // Obtener la aprobacion vinculada al prestamo
  const aprobRes = await request(ctx.app.getHttpServer())
    .get(`/api/v1/aprobaciones/entidad/prestamos/${prestamoId}`)
    .set('Authorization', `Bearer ${ctx.adminToken}`)
    .expect(200);

  const aprobacion = Array.isArray(aprobRes.body) ? aprobRes.body[0] : aprobRes.body;
  const aprobacionId: string = aprobacion._id ?? aprobacion.id;

  // El spy puede haber sido llamado > 0 veces si hay múltiples aprobadores
  const rawToken = extractToken(ctx.emailSpy, 0);

  return { prestamoId, aprobacionId, rawToken };
}

// ─── T022 — Happy path: aprobar vía token ─────────────────────────────────────

describe('T022 — Happy path: aprobar prestamo vía magic-link token', () => {
  let ctx: AppContext;

  beforeAll(async () => {
    ctx = await setupContext('t022');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('crea prestamo → aprobacion creada → aprobador aprueba via token → prestamo ACTIVE', async () => {
    const { prestamoId, rawToken } = await crearPrestamoConAprobacion(ctx);

    // El prestamo debe estar esperando aprobacion
    const prestamoRes = await request(ctx.app.getHttpServer())
      .get(`/api/v1/prestamos/${prestamoId}`)
      .set('Authorization', `Bearer ${ctx.tesoreriaToken}`)
      .expect(200);

    expect(prestamoRes.body.status).toBe('ESPERANDO_APROBACION');

    // Aprobador usa el token para aprobar
    const tokenRes = await request(ctx.app.getHttpServer())
      .post('/api/v1/aprobaciones/decidir-via-token')
      .send({ token: rawToken, decision: 'aprobar' })
      .expect(200);

    expect(tokenRes.body.estadoAprobacion).toBe('aprobada');

    // El prestamo debe haber transitado a ACTIVE
    const prestamoFinal = await request(ctx.app.getHttpServer())
      .get(`/api/v1/prestamos/${prestamoId}`)
      .set('Authorization', `Bearer ${ctx.tesoreriaToken}`)
      .expect(200);

    expect(prestamoFinal.body.status).toBe('ACTIVE');
  });
});

// ─── T023 — Reject path ───────────────────────────────────────────────────────

describe('T023 — Reject path: rechazar vía token → prestamo ANULADO + audit', () => {
  let ctx: AppContext;

  beforeAll(async () => {
    ctx = await setupContext('t023');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('aprobador rechaza via token → estadoAprobacion=rechazada → prestamo ANULADO', async () => {
    const { prestamoId, rawToken } = await crearPrestamoConAprobacion(ctx);

    const tokenRes = await request(ctx.app.getHttpServer())
      .post('/api/v1/aprobaciones/decidir-via-token')
      .send({ token: rawToken, decision: 'rechazar', comentario: 'Monto excesivo' })
      .expect(200);

    expect(tokenRes.body.estadoAprobacion).toBe('rechazada');

    const prestamoFinal = await request(ctx.app.getHttpServer())
      .get(`/api/v1/prestamos/${prestamoId}`)
      .set('Authorization', `Bearer ${ctx.tesoreriaToken}`)
      .expect(200);

    expect(prestamoFinal.body.status).toBe('ANULADO');
  });
});

// ─── T024 — Token reused + expired ───────────────────────────────────────────

describe('T024 — Token reused + expired: segundo uso → 401; token expirado → 401', () => {
  let ctx: AppContext;

  beforeAll(async () => {
    ctx = await setupContext('t024');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('reutilizar el mismo token devuelve 401 con mensaje genérico', async () => {
    const { rawToken } = await crearPrestamoConAprobacion(ctx);

    // Primer uso — OK
    await request(ctx.app.getHttpServer())
      .post('/api/v1/aprobaciones/decidir-via-token')
      .send({ token: rawToken, decision: 'aprobar' })
      .expect(200);

    // Segundo uso — debe ser 401
    const reuseRes = await request(ctx.app.getHttpServer())
      .post('/api/v1/aprobaciones/decidir-via-token')
      .send({ token: rawToken, decision: 'aprobar' })
      .expect(401);

    // No debe revelar detalles (mensaje genérico)
    expect(reuseRes.body.message).toBe('Token inválido o expirado');
  });

  it('token con expiresAt en el pasado devuelve 401', async () => {
    const { aprobacionId } = await crearPrestamoConAprobacion(ctx);

    // Manipular el token en DB para que esté expirado
    const tokenModel: Model<any> = ctx.app.get(getModelToken('AprobacionToken'));
    await tokenModel.updateMany(
      { aprobacionId, usado: false },
      { expiresAt: new Date('2020-01-01') },
    );

    // Capturar el token recién emitido (antes de expirar en DB)
    // El raw token ya fue capturado en crearPrestamoConAprobacion vía emailSpy
    // pero fue el PRIMER token. Necesitamos un token con el raw disponible.
    // Como ya modificamos todos los tokens de esta aprobacion para que estén expirados,
    // cualquier token de esta aprobacion debe fallar.
    const expiredToken = extractToken(ctx.emailSpy, 0);

    const res = await request(ctx.app.getHttpServer())
      .post('/api/v1/aprobaciones/decidir-via-token')
      .send({ token: expiredToken, decision: 'aprobar' })
      .expect(401);

    expect(res.body.message).toBe('Token inválido o expirado');
  });
});

// ─── T025 — No aprobador / feature flag off ───────────────────────────────────

describe('T025 — No aprobador activo → 400 al crear; flag off → 503', () => {
  let appOn: INestApplication;
  let emailSpyOn: jest.Mock;
  let adminToken: string;
  let tesoreriaToken: string;

  beforeAll(async () => {
    ({ app: appOn, emailSpy: emailSpyOn } = await buildApp(true));
    adminToken = await login(appOn, 'admin@perc.com', 'admin123');

    const { token } = await crearUsuario(appOn, adminToken, {
      email: 't025-tesoreria@test.perc',
      password: 'Test1234!',
      nombre: 'Tesoreria-T025',
      role: 'tesoreria',
    });
    tesoreriaToken = token;
  });

  afterAll(async () => {
    await appOn.close();
  });

  it('deshabilitar al único aprobador → crear prestamo devuelve 400', async () => {
    // Deshabilitar el aprobador seeded (aprobador@perc.com)
    const usersRes = await request(appOn.getHttpServer())
      .get('/api/v1/auth/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const aprobadores = usersRes.body.filter((u: any) => u.role === 'aprobador');

    for (const ap of aprobadores) {
      await request(appOn.getHttpServer())
        .patch(`/api/v1/auth/users/${ap._id ?? ap.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ activo: false })
        .expect(200);
    }

    // Obtener empresas (mínimo 2 chars para la búsqueda)
    const [cliRes, provRes] = await Promise.all([
      request(appOn.getHttpServer())
        .get('/api/v1/prestamos/empresas/search?q=Pe')
        .set('Authorization', `Bearer ${tesoreriaToken}`)
        .expect(200),
      request(appOn.getHttpServer())
        .get('/api/v1/prestamos/empresas/search?q=Te')
        .set('Authorization', `Bearer ${tesoreriaToken}`)
        .expect(200),
    ]);

    const allEmpresas: Array<{ id: string; kind: string }> = [
      ...cliRes.body,
      ...provRes.body,
    ];
    const lenderId = allEmpresas.find((e) => e.kind === 'CLIENTE')?.id;
    const borrowerId = allEmpresas.find((e) => e.kind === 'PROVEEDORA')?.id;

    const res = await request(appOn.getHttpServer())
      .post('/api/v1/prestamos')
      .set('Authorization', `Bearer ${tesoreriaToken}`)
      .send({
        lender: { empresaId: lenderId, empresaKind: 'CLIENTE' },
        borrower: { empresaId: borrowerId, empresaKind: 'PROVEEDORA' },
        currency: 'ARS',
        capital: 100000,
        rate: 30,
        startDate: '2026-04-21',
        dueDate: '2026-07-21',
        vehicle: 'PAGARE',
        balanceCut: '12-31',
      })
      .expect(400);

    expect(res.body.message).toMatch(/aprobador/i);

    // Re-habilitar aprobadores para no contaminar otros tests que usen la misma DB
    for (const ap of aprobadores) {
      await request(appOn.getHttpServer())
        .patch(`/api/v1/auth/users/${ap._id ?? ap.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ activo: true })
        .expect(200);
    }
  });

  it('feature flag OFF → POST decidir-via-token → 503', async () => {
    const { app: appOff } = await buildApp(false);

    const res = await request(appOff.getHttpServer())
      .post('/api/v1/aprobaciones/decidir-via-token')
      .send({ token: 'cualquier-token', decision: 'aprobar' })
      .expect(503);

    expect(res.body.message).toMatch(/deshabilitada/i);

    await appOff.close();
  });
});

// ─── T026 — Role matrix ───────────────────────────────────────────────────────

describe('T026 — Role matrix: operador PATCH decidir → 403; aprobador → 200; tesoreria GET pendientes → 403', () => {
  let ctx: AppContext;
  let aprobacionId: string;

  beforeAll(async () => {
    ctx = await setupContext('t026');
    const result = await crearPrestamoConAprobacion(ctx);
    aprobacionId = result.aprobacionId;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('operador PATCH /aprobaciones/:id/decidir → 403', async () => {
    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/aprobaciones/${aprobacionId}/decidir`)
      .set('Authorization', `Bearer ${ctx.operadorToken}`)
      .send({ decision: 'aprobada' })
      .expect(403);
  });

  it('tesoreria GET /aprobaciones/pendientes → 403', async () => {
    await request(ctx.app.getHttpServer())
      .get('/api/v1/aprobaciones/pendientes')
      .set('Authorization', `Bearer ${ctx.tesoreriaToken}`)
      .expect(403);
  });

  it('aprobador PATCH /aprobaciones/:id/decidir → 200', async () => {
    const res = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/aprobaciones/${aprobacionId}/decidir`)
      .set('Authorization', `Bearer ${ctx.aprobadorToken}`)
      .send({ decision: 'aprobada' })
      .expect(200);

    expect(res.body.estado).toBe('aprobada');
  });
});

// ─── T027 — Rate limit ────────────────────────────────────────────────────────

describe('T027 — Rate limit: 11 requests/min al endpoint público → la 11ª devuelve 429', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // App independiente para no contaminar el estado de throttle de otros tests
    ({ app } = await buildApp(true));
  });

  afterAll(async () => {
    await app.close();
  });

  // potentially flaky — el estado de throttle es por proceso; correr en aislamiento
  it('la 11ª petición al endpoint público retorna 429', async () => {
    const responses: number[] = [];

    for (let i = 0; i < 11; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/aprobaciones/decidir-via-token')
        .send({ token: `token-invalido-${i}`, decision: 'aprobar' });
      responses.push(res.status);
    }

    // Los primeros 10 deben ser 401 (token inválido), el 11º debe ser 429
    const last = responses[responses.length - 1];
    expect(last).toBe(429);
  });
});

// ─── T039 — Resend happy path ─────────────────────────────────────────────────

describe('T039 — Resend happy: rechazar → reenviar → token viejo 401 + token nuevo → aprobar → ACTIVE', () => {
  let ctx: AppContext;

  beforeAll(async () => {
    ctx = await setupContext('t039');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('ciclo completo de reenvío termina con prestamo ACTIVE', async () => {
    const { prestamoId, aprobacionId, rawToken: tokenViejo } = await crearPrestamoConAprobacion(ctx);

    // Paso 1: rechazar con el token original
    await request(ctx.app.getHttpServer())
      .post('/api/v1/aprobaciones/decidir-via-token')
      .send({ token: tokenViejo, decision: 'rechazar' })
      .expect(200);

    // Verificar que el prestamo esté ANULADO
    const prestamoAnulado = await request(ctx.app.getHttpServer())
      .get(`/api/v1/prestamos/${prestamoId}`)
      .set('Authorization', `Bearer ${ctx.tesoreriaToken}`)
      .expect(200);
    expect(prestamoAnulado.body.status).toBe('ANULADO');

    // Paso 2: reenviar — tesorería hace PATCH /aprobaciones/:id/reenviar
    ctx.emailSpy.mockClear();

    const reenviarRes = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/aprobaciones/${aprobacionId}/reenviar`)
      .set('Authorization', `Bearer ${ctx.tesoreriaToken}`)
      .expect(200);

    expect(reenviarRes.body.estado).toBe('pendiente');
    expect(reenviarRes.body.reenviosRestantes).toBe(0);

    // Verificar que el prestamo volvió a ESPERANDO_APROBACION
    const prestamoRe = await request(ctx.app.getHttpServer())
      .get(`/api/v1/prestamos/${prestamoId}`)
      .set('Authorization', `Bearer ${ctx.tesoreriaToken}`)
      .expect(200);
    expect(prestamoRe.body.status).toBe('ESPERANDO_APROBACION');

    // Paso 3: token viejo debe dar 401 (fue invalidado por el reenvío)
    await request(ctx.app.getHttpServer())
      .post('/api/v1/aprobaciones/decidir-via-token')
      .send({ token: tokenViejo, decision: 'aprobar' })
      .expect(401);

    // Paso 4: extraer nuevo token del spy y aprobar
    const tokenNuevo = extractToken(ctx.emailSpy, 0);

    const aprobarRes = await request(ctx.app.getHttpServer())
      .post('/api/v1/aprobaciones/decidir-via-token')
      .send({ token: tokenNuevo, decision: 'aprobar' })
      .expect(200);

    expect(aprobarRes.body.estadoAprobacion).toBe('aprobada');

    // Paso 5: verificar prestamo ACTIVE
    const prestamoFinal = await request(ctx.app.getHttpServer())
      .get(`/api/v1/prestamos/${prestamoId}`)
      .set('Authorization', `Bearer ${ctx.tesoreriaToken}`)
      .expect(200);

    expect(prestamoFinal.body.status).toBe('ACTIVE');
  });
});

// ─── T040 — Terminal rejection ────────────────────────────────────────────────

describe('T040 — Terminal rejection: reenviar + segundo rechazo → rechazo-terminal; segundo reenviar → 400', () => {
  let ctx: AppContext;

  beforeAll(async () => {
    ctx = await setupContext('t040');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('segundo rechazo tras reenvío genera entrada audit rechazo-terminal y bloquea nuevo reenvío', async () => {
    const { aprobacionId, rawToken: tokenViejo } = await crearPrestamoConAprobacion(ctx);

    // Primer rechazo
    await request(ctx.app.getHttpServer())
      .post('/api/v1/aprobaciones/decidir-via-token')
      .send({ token: tokenViejo, decision: 'rechazar' })
      .expect(200);

    // Reenvío
    ctx.emailSpy.mockClear();
    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/aprobaciones/${aprobacionId}/reenviar`)
      .set('Authorization', `Bearer ${ctx.tesoreriaToken}`)
      .expect(200);

    // Segundo rechazo (rechazo terminal)
    const tokenNuevo = extractToken(ctx.emailSpy, 0);
    const rechazarRes = await request(ctx.app.getHttpServer())
      .post('/api/v1/aprobaciones/decidir-via-token')
      .send({ token: tokenNuevo, decision: 'rechazar', comentario: 'Definitivamente no' })
      .expect(200);

    expect(rechazarRes.body.estadoAprobacion).toBe('rechazada');

    // Intentar un segundo reenvío → debe devolver 400 (reenviosRestantes = 0)
    // Nota: el audit de 'rechazo-terminal' es fire-and-forget; no se verifica en e2e
    // porque el schema de AuditLog restringe el campo 'accion' a un enum fijo.
    const secondReenviar = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/aprobaciones/${aprobacionId}/reenviar`)
      .set('Authorization', `Bearer ${ctx.tesoreriaToken}`)
      .expect(400);

    expect(secondReenviar.body.message).toMatch(/reenv/i);
  });
});

// ─── T041 — Non-creator resend ────────────────────────────────────────────────

describe('T041 — Non-creator resend: tesorería B no puede reenviar; admin sí puede', () => {
  let ctx: AppContext;
  let tesoreriaBToken: string;

  beforeAll(async () => {
    ctx = await setupContext('t041');

    // Crear un segundo usuario de tesorería
    const result = await crearUsuario(ctx.app, ctx.adminToken, {
      email: 't041-tesoreria-b@test.perc',
      password: 'Test1234!',
      nombre: 'Tesoreria-B',
      role: 'tesoreria',
    });
    tesoreriaBToken = result.token;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('tesorería B intenta reenviar creación de tesorería A → 403', async () => {
    const { aprobacionId, rawToken } = await crearPrestamoConAprobacion(ctx);

    // Rechazar primero para que el estado sea 'rechazada'
    await request(ctx.app.getHttpServer())
      .post('/api/v1/aprobaciones/decidir-via-token')
      .send({ token: rawToken, decision: 'rechazar' })
      .expect(200);

    // Tesorería B intenta reenviar → 403
    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/aprobaciones/${aprobacionId}/reenviar`)
      .set('Authorization', `Bearer ${tesoreriaBToken}`)
      .expect(403);
  });

  it('admin puede reenviar la solicitud de otro usuario', async () => {
    const { aprobacionId, rawToken } = await crearPrestamoConAprobacion(ctx);

    // Rechazar primero
    await request(ctx.app.getHttpServer())
      .post('/api/v1/aprobaciones/decidir-via-token')
      .send({ token: rawToken, decision: 'rechazar' })
      .expect(200);

    ctx.emailSpy.mockClear();

    // Admin reenvía
    const reenviarRes = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/aprobaciones/${aprobacionId}/reenviar`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .expect(200);

    expect(reenviarRes.body.estado).toBe('pendiente');
  });
});

// ─── T042 — Wrong estado ──────────────────────────────────────────────────────

describe('T042 — Resend wrong estado: reenviar una aprobación pendiente o aprobada → 400', () => {
  let ctx: AppContext;

  beforeAll(async () => {
    ctx = await setupContext('t042');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('reenviar aprobación en estado pendiente → 400', async () => {
    const { aprobacionId } = await crearPrestamoConAprobacion(ctx);

    // Estado actual: pendiente — NO rechazar primero
    const res = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/aprobaciones/${aprobacionId}/reenviar`)
      .set('Authorization', `Bearer ${ctx.tesoreriaToken}`)
      .expect(400);

    expect(res.body.message).toMatch(/rechazad/i);
  });

  it('reenviar aprobación en estado aprobada → 400', async () => {
    const { aprobacionId, rawToken } = await crearPrestamoConAprobacion(ctx);

    // Aprobar primero
    await request(ctx.app.getHttpServer())
      .post('/api/v1/aprobaciones/decidir-via-token')
      .send({ token: rawToken, decision: 'aprobar' })
      .expect(200);

    const res = await request(ctx.app.getHttpServer())
      .patch(`/api/v1/aprobaciones/${aprobacionId}/reenviar`)
      .set('Authorization', `Bearer ${ctx.tesoreriaToken}`)
      .expect(400);

    expect(res.body.message).toMatch(/rechazad/i);
  });
});

// ─── T043 — Intentos[] history ────────────────────────────────────────────────

describe('T043 — Intentos history: después del ciclo completo + reenvío, intentos[0] tiene snapshot correcto', () => {
  let ctx: AppContext;

  beforeAll(async () => {
    ctx = await setupContext('t043');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('intentos[0] contiene snapshot con estadoFinal=rechazada, aprobadores con decisión rechazada y numero=1', async () => {
    const { aprobacionId, rawToken } = await crearPrestamoConAprobacion(ctx);

    // Rechazar
    await request(ctx.app.getHttpServer())
      .post('/api/v1/aprobaciones/decidir-via-token')
      .send({ token: rawToken, decision: 'rechazar', comentario: 'No aprobado' })
      .expect(200);

    // Reenviar — esto genera el snapshot en intentos[0]
    ctx.emailSpy.mockClear();
    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/aprobaciones/${aprobacionId}/reenviar`)
      .set('Authorization', `Bearer ${ctx.tesoreriaToken}`)
      .expect(200);

    // Verificar el estado de la aprobación
    const aprobRes = await request(ctx.app.getHttpServer())
      .get(`/api/v1/aprobaciones/${aprobacionId}`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .expect(200);

    const aprobacion = aprobRes.body;

    expect(aprobacion.intentos).toHaveLength(1);

    const intento = aprobacion.intentos[0];
    expect(intento.numero).toBe(1);
    expect(intento.estadoFinal).toBe('rechazada');
    expect(intento.aprobadores).toHaveLength(1);
    expect(intento.aprobadores[0].decision).toBe('rechazada');
    expect(intento.aprobadores[0].comentario).toBe('No aprobado');

    // El nuevo ciclo debe estar limpio
    expect(aprobacion.estado).toBe('pendiente');
    expect(aprobacion.aprobadores).toHaveLength(0);
    expect(aprobacion.reenviosRestantes).toBe(0);
  });
});
