/**
 * T033 — Unit tests para AprobacionService.reenviar()
 *
 * Cubre:
 *   - non-creator → ForbiddenException
 *   - estado !== 'rechazada' → BadRequestException
 *   - reenviosRestantes === 0 → BadRequestException
 *   - sin aprobadores activos → BadRequestException
 *   - happy path → snapshot intentos[], reset de estado, invalidar tokens, emitir tokens, emitir evento
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';

import { AprobacionService } from './aprobacion.service';
import { AprobacionTokenService } from './aprobacion-token.service';
import { NotificacionService } from '../notificacion/notificacion.service';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EmailService } from '../../integrations/email/email.service';
import { HashChainService } from '../../common/services/hash-chain.service';
import { TsaClient } from '../../common/services/tsa.client';
import { StepUpService } from './step-up.service';
import {
  APROBACION_REENVIADA,
  APROBACION_RESUELTA,
} from './events/aprobacion-resuelta.event';

// ─── Factories de mocks ───────────────────────────────────────────────────────

function buildAprobacionDoc(overrides: Partial<Record<string, any>> = {}) {
  const base = {
    _id: { toString: () => 'aprobacion-id-001' },
    estado: 'rechazada',
    createdBy: 'user-tesoreria-001',
    createdByEmail: 'tesoreria@test.perc',
    tipo: 'creacion',
    entidad: 'prestamos',
    entidadId: 'prestamo-id-001',
    monto: 500000,
    descripcion: 'Préstamo Test → Prov por 500.000 ARS',
    aprobadores: [
      {
        userId: 'user-aprobador-001',
        nombre: 'Aprobador Test',
        email: 'aprobador@test.perc',
        decision: 'rechazada',
        comentario: 'No conveniente',
        fecha: new Date(),
      },
    ],
    aprobacionesRequeridas: 1,
    intentos: [],
    historial: [],
    reenviosRestantes: 1,
    fechaReenvio: null,
    reenviadoPor: null,
    createdAt: new Date('2026-04-01'),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return base;
}

function buildAprobadorDoc(overrides: Partial<Record<string, any>> = {}) {
  return {
    _id: { toString: () => 'user-aprobador-001' },
    email: 'aprobador@test.perc',
    nombre: 'Aprobador Test',
    role: 'aprobador',
    activo: true,
    ...overrides,
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('AprobacionService', () => {
  let service: AprobacionService;

  // Mocks de dependencias
  let aprobacionModelMock: {
    findById: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    countDocuments: jest.Mock;
    updateOne: jest.Mock;
  };
  let userModelMock: { find: jest.Mock };
  let notifServiceMock: { notifyUsersByRole: jest.Mock; create: jest.Mock };
  let configServiceMock: { getApprovalConfig: jest.Mock; get: jest.Mock };
  let nestConfigServiceMock: { get: jest.Mock };
  let tokenServiceMock: {
    issueForAprobador: jest.Mock;
    verify: jest.Mock;
    consume: jest.Mock;
    invalidateAllForAprobacion: jest.Mock;
  };
  let auditLogServiceMock: { log: jest.Mock };
  let emailServiceMock: { sendAprobacionMagicLink: jest.Mock };
  let eventEmitterMock: { emit: jest.Mock };

  beforeEach(async () => {
    aprobacionModelMock = {
      findById: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      countDocuments: jest.fn().mockResolvedValue(0),
      updateOne: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue(undefined) }),
    };

    userModelMock = {
      find: jest.fn().mockResolvedValue([buildAprobadorDoc()]),
    };

    notifServiceMock = {
      notifyUsersByRole: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockResolvedValue(undefined),
    };

    configServiceMock = {
      getApprovalConfig: jest.fn().mockResolvedValue({
        rules: [{ min: 0, max: undefined, aprobaciones: 1 }],
      }),
      get: jest.fn().mockResolvedValue({}),
    };

    nestConfigServiceMock = {
      get: jest.fn((key: string) => {
        if (key === 'magicLink.enabled') return true;
        if (key === 'magicLink.baseUrl') return 'http://localhost:4200/aprobar';
        if (key === 'magicLink.ttlHours') return 48;
        return undefined;
      }),
    };

    tokenServiceMock = {
      issueForAprobador: jest.fn().mockResolvedValue('raw-token-nuevo'),
      verify: jest.fn(),
      consume: jest.fn().mockResolvedValue(undefined),
      invalidateAllForAprobacion: jest.fn().mockResolvedValue(undefined),
    };

    auditLogServiceMock = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    emailServiceMock = {
      sendAprobacionMagicLink: jest.fn().mockResolvedValue(true),
    };

    eventEmitterMock = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AprobacionService,
        { provide: getModelToken('Aprobacion'), useValue: aprobacionModelMock },
        { provide: getModelToken('User'), useValue: userModelMock },
        { provide: NotificacionService, useValue: notifServiceMock },
        { provide: ConfiguracionService, useValue: configServiceMock },
        { provide: ConfigService, useValue: nestConfigServiceMock },
        { provide: AprobacionTokenService, useValue: tokenServiceMock },
        { provide: AuditLogService, useValue: auditLogServiceMock },
        { provide: EmailService, useValue: emailServiceMock },
        { provide: EventEmitter2, useValue: eventEmitterMock },
        HashChainService,
        {
          provide: TsaClient,
          useValue: {
            timestamp: jest.fn().mockResolvedValue({ token: null }),
            isEnabled: () => false,
          },
        },
        {
          provide: StepUpService,
          useValue: {
            aprobadorEnrolado: jest.fn().mockResolvedValue(false),
            iniciarDesafio: jest.fn(),
            verificarDesafio: jest.fn(),
            validarYConsumirProof: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AprobacionService>(AprobacionService);
  });

  // ─── Caso: non-creator ─────────────────────────────────────────────────────

  describe('cuando el usuario NO es el creador', () => {
    it('lanza ForbiddenException', async () => {
      const aprobacion = buildAprobacionDoc({ createdBy: 'otro-usuario-id' });
      aprobacionModelMock.findById.mockResolvedValue(aprobacion);

      await expect(
        service.reenviar('aprobacion-id-001', {
          userId: 'user-tesoreria-001',
          email: 'tesoreria@test.perc',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── Caso: estado incorrecto ───────────────────────────────────────────────

  describe('cuando el estado NO es rechazada', () => {
    it.each(['pendiente', 'aprobada'])(
      'lanza BadRequestException para estado=%s',
      async (estado) => {
        const aprobacion = buildAprobacionDoc({ estado });
        aprobacionModelMock.findById.mockResolvedValue(aprobacion);

        await expect(
          service.reenviar('aprobacion-id-001', {
            userId: 'user-tesoreria-001',
            email: 'tesoreria@test.perc',
          }),
        ).rejects.toThrow(BadRequestException);
      },
    );
  });

  // ─── Caso: reenviosRestantes === 0 ────────────────────────────────────────

  describe('cuando reenviosRestantes es 0', () => {
    it('lanza BadRequestException', async () => {
      const aprobacion = buildAprobacionDoc({ reenviosRestantes: 0 });
      aprobacionModelMock.findById.mockResolvedValue(aprobacion);

      await expect(
        service.reenviar('aprobacion-id-001', {
          userId: 'user-tesoreria-001',
          email: 'tesoreria@test.perc',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Caso: sin aprobadores activos ────────────────────────────────────────

  describe('cuando no hay aprobadores activos', () => {
    it('lanza BadRequestException', async () => {
      const aprobacion = buildAprobacionDoc();
      aprobacionModelMock.findById.mockResolvedValue(aprobacion);
      userModelMock.find.mockResolvedValue([]); // sin aprobadores

      await expect(
        service.reenviar('aprobacion-id-001', {
          userId: 'user-tesoreria-001',
          email: 'tesoreria@test.perc',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Caso: happy path ─────────────────────────────────────────────────────

  describe('happy path', () => {
    let aprobacion: ReturnType<typeof buildAprobacionDoc>;

    beforeEach(() => {
      aprobacion = buildAprobacionDoc();
      aprobacionModelMock.findById.mockResolvedValue(aprobacion);
      userModelMock.find.mockResolvedValue([buildAprobadorDoc()]);
    });

    it('guarda snapshot en intentos[], resetea estado a pendiente y decrementa reenviosRestantes', async () => {
      await service.reenviar('aprobacion-id-001', {
        userId: 'user-tesoreria-001',
        email: 'tesoreria@test.perc',
      });

      expect(aprobacion.intentos).toHaveLength(1);
      expect(aprobacion.intentos[0].numero).toBe(1);
      expect(aprobacion.intentos[0].estadoFinal).toBe('rechazada');
      expect(aprobacion.intentos[0].aprobadores).toHaveLength(1);

      expect(aprobacion.estado).toBe('pendiente');
      expect(aprobacion.aprobadores).toHaveLength(0);
      expect(aprobacion.reenviosRestantes).toBe(0);
    });

    it('llama a save() para persistir el reset del ciclo', async () => {
      await service.reenviar('aprobacion-id-001', {
        userId: 'user-tesoreria-001',
        email: 'tesoreria@test.perc',
      });

      expect(aprobacion.save).toHaveBeenCalledTimes(1);
    });

    it('invalida tokens del ciclo anterior ANTES de emitir nuevos', async () => {
      const callOrder: string[] = [];
      tokenServiceMock.invalidateAllForAprobacion.mockImplementation(
        async () => {
          callOrder.push('invalidate');
        },
      );
      tokenServiceMock.issueForAprobador.mockImplementation(async () => {
        callOrder.push('issue');
        return 'raw-token-nuevo';
      });

      await service.reenviar('aprobacion-id-001', {
        userId: 'user-tesoreria-001',
        email: 'tesoreria@test.perc',
      });

      expect(callOrder.indexOf('invalidate')).toBeLessThan(
        callOrder.indexOf('issue'),
      );
    });

    it('emite el token para cada aprobador activo', async () => {
      await service.reenviar('aprobacion-id-001', {
        userId: 'user-tesoreria-001',
        email: 'tesoreria@test.perc',
      });

      expect(tokenServiceMock.issueForAprobador).toHaveBeenCalledWith(
        'aprobacion-id-001',
        'user-aprobador-001',
        'aprobador@test.perc',
      );
      expect(emailServiceMock.sendAprobacionMagicLink).toHaveBeenCalledTimes(1);
    });

    it('emite el evento APROBACION_REENVIADA con los datos correctos', async () => {
      await service.reenviar('aprobacion-id-001', {
        userId: 'user-tesoreria-001',
        email: 'tesoreria@test.perc',
      });

      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        APROBACION_REENVIADA,
        expect.objectContaining({
          aprobacionId: 'aprobacion-id-001',
          entidad: 'prestamos',
          entidadId: 'prestamo-id-001',
        }),
      );
    });
  });

  // ─── Caso: aprobación no encontrada ──────────────────────────────────────

  describe('cuando la aprobación no existe en DB', () => {
    it('lanza NotFoundException', async () => {
      aprobacionModelMock.findById.mockResolvedValue(null);

      await expect(
        service.reenviar('id-inexistente', {
          userId: 'user-tesoreria-001',
          email: 'tesoreria@test.perc',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── decidir() ─────────────────────────────────────────────────────────────
  describe('decidir()', () => {
    const aprobador = {
      userId: 'user-aprobador-001',
      email: 'aprobador@test.perc',
      nombre: 'Aprobador',
    };

    it('lanza NotFoundException si la aprobación no existe', async () => {
      aprobacionModelMock.findById.mockResolvedValue(null);
      await expect(service.decidir('x', aprobador, 'aprobada')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza BadRequestException si ya fue resuelta (estado !== pendiente)', async () => {
      aprobacionModelMock.findById.mockResolvedValue(
        buildAprobacionDoc({ estado: 'aprobada' }),
      );
      await expect(service.decidir('x', aprobador, 'aprobada')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza BadRequestException si el creador intenta aprobar su propia solicitud', async () => {
      aprobacionModelMock.findById.mockResolvedValue(
        buildAprobacionDoc({
          estado: 'pendiente',
          createdBy: aprobador.userId,
          aprobadores: [],
        }),
      );
      await expect(service.decidir('x', aprobador, 'aprobada')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza BadRequestException si el aprobador ya decidió', async () => {
      aprobacionModelMock.findById.mockResolvedValue(
        buildAprobacionDoc({
          estado: 'pendiente',
          createdBy: 'creator',
          aprobadores: [{ userId: aprobador.userId }],
        }),
      );
      await expect(service.decidir('x', aprobador, 'aprobada')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rechazada: marca estado rechazada, notifica al creador y emite evento', async () => {
      const doc = buildAprobacionDoc({
        estado: 'pendiente',
        createdBy: 'creator',
        aprobadores: [],
      });
      aprobacionModelMock.findById.mockResolvedValue(doc);

      await service.decidir(
        'aprobacion-id-001',
        aprobador,
        'rechazada',
        'no conviene',
      );

      expect(doc.estado).toBe('rechazada');
      expect(doc.aprobadores).toHaveLength(1);
      expect(notifServiceMock.create).toHaveBeenCalled();
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        APROBACION_RESUELTA,
        expect.objectContaining({ estado: 'rechazada', entidad: 'prestamos' }),
      );
    });

    it('aprobada (alcanza requeridas): marca aprobada, avisa a operadores y emite evento', async () => {
      const doc = buildAprobacionDoc({
        estado: 'pendiente',
        createdBy: 'creator',
        aprobadores: [],
        aprobacionesRequeridas: 1,
      });
      aprobacionModelMock.findById.mockResolvedValue(doc);

      await service.decidir('aprobacion-id-001', aprobador, 'aprobada');

      expect(doc.estado).toBe('aprobada');
      expect(notifServiceMock.notifyUsersByRole).toHaveBeenCalledWith(
        ['operador'],
        expect.anything(),
        expect.objectContaining({ sendEmail: false }),
      );
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        APROBACION_RESUELTA,
        expect.objectContaining({ estado: 'aprobada' }),
      );
    });

    // ─── REGRESIÓN #2: step-up enforced TAMBIÉN en el path JWT ────────────────

    it('SEGURIDAD: con step-up requerido y SIN proof, el path JWT NIEGA la decisión', async () => {
      // Habilita step-up por monto: el path JWT ya no puede saltearlo.
      configServiceMock.get.mockResolvedValue({
        habilitado: true,
        montoUmbral: 1_000_000,
        factorPorDefecto: 'totp',
      });
      const doc = buildAprobacionDoc({
        estado: 'pendiente',
        createdBy: 'creator',
        aprobadores: [],
        monto: 5_000_000,
      });
      aprobacionModelMock.findById.mockResolvedValue(doc);

      await expect(
        // sin desafioId/stepUpProof → debe rechazar
        service.decidir('aprobacion-id-001', aprobador, 'aprobada'),
      ).rejects.toThrow(UnauthorizedException);
      // NO se aprobó ni se persistió la decisión
      expect(doc.estado).toBe('pendiente');
      expect(doc.save).not.toHaveBeenCalled();
    });

    it('SEGURIDAD: path JWT aprueba sólo si valida+consume el proof de step-up', async () => {
      configServiceMock.get.mockResolvedValue({
        habilitado: true,
        montoUmbral: 1_000_000,
        factorPorDefecto: 'totp',
      });
      const doc = buildAprobacionDoc({
        estado: 'pendiente',
        createdBy: 'creator',
        aprobadores: [],
        monto: 5_000_000,
        aprobacionesRequeridas: 1,
      });
      aprobacionModelMock.findById.mockResolvedValue(doc);
      const stepUpService = service['stepUpService'] as any;
      stepUpService.validarYConsumirProof.mockResolvedValue({
        factorUsado: 'totp',
        desafioId: 'des-1',
      });

      await service.decidir(
        'aprobacion-id-001',
        aprobador,
        'aprobada',
        undefined,
        undefined,
        { desafioId: 'des-1', stepUpProof: 'proof-ok' },
      );

      // El proof se valida y consume scoped a (aprobacionId, userId del JWT)
      expect(stepUpService.validarYConsumirProof).toHaveBeenCalledWith(
        'aprobacion-id-001',
        aprobador.userId,
        'des-1',
        'proof-ok',
      );
      expect(doc.estado).toBe('aprobada');
      // El forense de la decisión deja registro de que step-up fue satisfecho
      expect(doc.aprobadores[doc.aprobadores.length - 1]).toMatchObject({
        stepUpRequerido: true,
        stepUpSatisfecho: true,
        factorStepUp: 'totp',
      });
    });

    it('SEGURIDAD: path JWT con proof inválido (StepUpService lanza) NO aprueba', async () => {
      configServiceMock.get.mockResolvedValue({
        habilitado: true,
        montoUmbral: 1_000_000,
        factorPorDefecto: 'totp',
      });
      const doc = buildAprobacionDoc({
        estado: 'pendiente',
        createdBy: 'creator',
        aprobadores: [],
        monto: 5_000_000,
      });
      aprobacionModelMock.findById.mockResolvedValue(doc);
      const stepUpService = service['stepUpService'] as any;
      stepUpService.validarYConsumirProof.mockRejectedValue(
        new UnauthorizedException('Step-up requerido o inválido'),
      );

      await expect(
        service.decidir(
          'aprobacion-id-001',
          aprobador,
          'aprobada',
          undefined,
          undefined,
          { desafioId: 'des-1', stepUpProof: 'proof-malo' },
        ),
      ).rejects.toThrow(UnauthorizedException);
      expect(doc.estado).toBe('pendiente');
    });
  });

  // ─── No-repudio: historial tamper-evident + forense ────────────────────────
  describe('no-repudio del historial', () => {
    const aprobador = {
      userId: 'user-aprobador-001',
      email: 'aprobador@test.perc',
      nombre: 'Aprobador',
    };

    it('decidir encadena una entry de historial y persiste el forense en la decisión', async () => {
      const doc = buildAprobacionDoc({
        estado: 'pendiente',
        createdBy: 'creator',
        aprobadores: [],
        historial: [],
      });
      aprobacionModelMock.findById.mockResolvedValue(doc);

      await service.decidir('aprobacion-id-001', aprobador, 'aprobada', 'ok', {
        ip: '203.0.113.9',
        userAgent: 'jest',
        tokenHash: 'abc123',
      });

      expect(doc.historial).toHaveLength(1);
      expect(doc.historial[0]).toMatchObject({
        accion: 'decidir',
        usuario: aprobador.userId,
        estadoNuevo: 'aprobada',
        motivo: 'ok',
      });
      expect(doc.historial[0].hash).toMatch(/^[0-9a-f]{64}$/);
      // El forense sobrevive al TTL del token porque vive en la decisión, no en el token.
      expect(doc.aprobadores[0]).toMatchObject({
        ip: '203.0.113.9',
        userAgent: 'jest',
        tokenHash: 'abc123',
      });
    });

    it('verificarIntegridad valida una cadena consistente y detecta tampering', async () => {
      const hc = new HashChainService();
      const e1: Record<string, any> = {
        accion: 'crear',
        usuario: 'creator',
        fecha: new Date('2026-04-01'),
      };
      e1.hash = hc.computeHash('', e1 as any);
      const e2: Record<string, any> = {
        accion: 'decidir',
        usuario: aprobador.userId,
        estadoNuevo: 'aprobada',
        motivo: 'ok',
        fecha: new Date('2026-04-02'),
      };
      e2.prevHash = e1.hash;
      e2.hash = hc.computeHash(e1.hash as string, e2 as any);

      aprobacionModelMock.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ historial: [e1, e2] }),
      });
      const ok = await service.verificarIntegridad('aprobacion-id-001');
      expect(ok).toMatchObject({ valid: true, brokenAt: null, total: 2 });

      // Tamper: alterar la decisión sin recomputar el hash → la cadena se rompe en la entry 1.
      aprobacionModelMock.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          historial: [e1, { ...e2, estadoNuevo: 'rechazada' }],
        }),
      });
      const bad = await service.verificarIntegridad('aprobacion-id-001');
      expect(bad.valid).toBe(false);
      expect(bad.brokenAt).toBe(1);
    });
  });
});
