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
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';

import { AprobacionService } from './aprobacion.service';
import { AprobacionTokenService } from './aprobacion-token.service';
import { NotificacionService } from '../notificacion/notificacion.service';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EmailService } from '../../integrations/email/email.service';
import { APROBACION_REENVIADA } from './events/aprobacion-resuelta.event';

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

describe('AprobacionService — reenviar()', () => {
  let service: AprobacionService;

  // Mocks de dependencias
  let aprobacionModelMock: {
    findById: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    countDocuments: jest.Mock;
  };
  let userModelMock: { find: jest.Mock };
  let notifServiceMock: { notifyUsersByRole: jest.Mock; create: jest.Mock };
  let configServiceMock: { getApprovalConfig: jest.Mock };
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
      tokenServiceMock.invalidateAllForAprobacion.mockImplementation(async () => {
        callOrder.push('invalidate');
      });
      tokenServiceMock.issueForAprobador.mockImplementation(async () => {
        callOrder.push('issue');
        return 'raw-token-nuevo';
      });

      await service.reenviar('aprobacion-id-001', {
        userId: 'user-tesoreria-001',
        email: 'tesoreria@test.perc',
      });

      expect(callOrder.indexOf('invalidate')).toBeLessThan(callOrder.indexOf('issue'));
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
});
