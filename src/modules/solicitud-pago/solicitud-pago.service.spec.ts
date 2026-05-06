import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { SolicitudPagoService } from './solicitud-pago.service';
import { SolicitudPago } from './schemas/solicitud-pago.schema';
import { Factura } from '../factura/schemas/factura.schema';
import { Pago } from '../pago/schemas/pago.schema';
import { OrdenPago } from '../orden-pago/schemas/orden-pago.schema';
import { Convenio } from '../convenio/schemas/convenio.schema';
import { User } from '../../auth/schemas/user.schema';
import { StorageService } from '../../integrations/storage/storage.service';
import { PagoCalculatorService } from '../../common/services/pago-calculator.service';
import { EmailService } from '../../integrations/email/email.service';
import { HashChainService } from './hash-chain.service';
import { TsaClient } from './tsa.client';
import { ExportService } from '../../common/services/export.service';

describe('SolicitudPagoService — state machine', () => {
  let service: SolicitudPagoService;
  let solicitudModel: any;
  let facturaModel: any;
  const userId = '507f1f77bcf86cd799439011';
  const facturaId = '507f1f77bcf86cd799439020';

  function makeFactura(over: any = {}) {
    return {
      _id: new Types.ObjectId(facturaId),
      empresaProveedora: new Types.ObjectId(),
      saldoPendiente: 100000,
      estado: 'pendiente',
      ...over,
    };
  }
  function makeSolicitud(over: any = {}) {
    return {
      _id: new Types.ObjectId(),
      tipo: 'manual',
      monto: 50000,
      estado: 'pendiente',
      historial: [{ accion: 'crear', usuario: new Types.ObjectId(userId), estadoNuevo: 'pendiente', fecha: new Date(), hash: 'abc' }],
      comprobantes: [],
      reagendadoVeces: 0,
      save: jest.fn().mockResolvedValue(undefined),
      ...over,
    };
  }

  beforeEach(async () => {
    solicitudModel = {
      create: jest.fn(),
      findById: jest.fn(),
      findOneAndUpdate: jest.fn(),
      find: jest.fn(),
    };
    facturaModel = {
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SolicitudPagoService,
        { provide: getModelToken(SolicitudPago.name), useValue: solicitudModel },
        { provide: getModelToken(Factura.name), useValue: facturaModel },
        { provide: getModelToken(Pago.name), useValue: { create: jest.fn(), find: jest.fn().mockReturnValue({ lean: () => Promise.resolve([]) }) } },
        { provide: getModelToken(OrdenPago.name), useValue: { findById: jest.fn() } },
        { provide: getModelToken(Convenio.name), useValue: { findOne: jest.fn().mockReturnValue({ lean: () => Promise.resolve(null) }) } },
        { provide: getModelToken(User.name), useValue: { find: jest.fn().mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) }) } },
        { provide: StorageService, useValue: { upload: jest.fn(), getSignedDownloadUrl: jest.fn() } },
        { provide: PagoCalculatorService, useValue: { calculate: jest.fn().mockReturnValue({ comision: 0, porcentajeComision: 0, descuento: 0, porcentajeDescuento: 0, totalRetenciones: 0, montoNeto: 0 }) } },
        { provide: EmailService, useValue: { sendEmail: jest.fn() } },
        { provide: ConfigService, useValue: { get: () => '' } },
        HashChainService,
        { provide: TsaClient, useValue: { timestamp: jest.fn().mockResolvedValue({ token: null }), isEnabled: () => false } },
        { provide: ExportService, useValue: { generateExcel: jest.fn().mockResolvedValue(Buffer.from('')) } },
      ],
    }).compile();

    service = module.get(SolicitudPagoService);
  });

  // ─── create ──────────────────────────────────────────────────────────

  describe('create', () => {
    it('rejects monto > saldoPendiente', async () => {
      facturaModel.findById.mockResolvedValue(makeFactura({ saldoPendiente: 1000 }));
      solicitudModel.find.mockReturnValue({ lean: () => Promise.resolve([]) });
      await expect(service.create({ factura: facturaId, tipo: 'manual', monto: 5000, medioPago: 'transferencia' } as any, { userId, email: '' })).rejects.toThrow(BadRequestException);
    });

    it('rejects oversubscription across pending solicitudes', async () => {
      facturaModel.findById.mockResolvedValue(makeFactura({ saldoPendiente: 1000 }));
      solicitudModel.find.mockReturnValue({ lean: () => Promise.resolve([{ monto: 600 }, { monto: 300 }]) });
      // saldo 1000, ya comprometido 900, disponible 100. Pido 200 → debe rechazar.
      await expect(service.create({ factura: facturaId, tipo: 'manual', monto: 200, medioPago: 'transferencia' } as any, { userId, email: '' })).rejects.toThrow(/excede saldo disponible/);
    });

    it('rejects compromiso without fechaVencimiento', async () => {
      facturaModel.findById.mockResolvedValue(makeFactura());
      solicitudModel.find.mockReturnValue({ lean: () => Promise.resolve([]) });
      await expect(service.create({ factura: facturaId, tipo: 'compromiso', monto: 1000, medioPago: 'transferencia' } as any, { userId, email: '' })).rejects.toThrow(/fechaVencimiento/);
    });

    it('rejects compromiso with past fechaVencimiento', async () => {
      facturaModel.findById.mockResolvedValue(makeFactura());
      solicitudModel.find.mockReturnValue({ lean: () => Promise.resolve([]) });
      const ayer = new Date(Date.now() - 86400000).toISOString();
      await expect(service.create({ factura: facturaId, tipo: 'compromiso', monto: 1000, fechaVencimiento: ayer, medioPago: 'transferencia' } as any, { userId, email: '' })).rejects.toThrow(/futura/);
    });

    it('rejects when factura is anulada or pagada', async () => {
      facturaModel.findById.mockResolvedValue(makeFactura({ estado: 'pagada' }));
      solicitudModel.find.mockReturnValue({ lean: () => Promise.resolve([]) });
      await expect(service.create({ factura: facturaId, tipo: 'manual', monto: 1000, medioPago: 'transferencia' } as any, { userId, email: '' })).rejects.toThrow(/no admite/);
    });

    it('requires either factura or ordenPago, not both nor neither', async () => {
      await expect(service.create({ tipo: 'manual', monto: 1000, medioPago: 'transferencia' } as any, { userId, email: '' })).rejects.toThrow(BadRequestException);
      await expect(service.create({ factura: facturaId, ordenPago: facturaId, tipo: 'manual', monto: 1000, medioPago: 'transferencia' } as any, { userId, email: '' })).rejects.toThrow(BadRequestException);
    });
  });

  // ─── transitions ─────────────────────────────────────────────────────

  describe('aprobar', () => {
    it('transitions pendiente → en_proceso atomically', async () => {
      const sol = makeSolicitud({ estado: 'pendiente' });
      solicitudModel.findById.mockResolvedValue(sol);
      solicitudModel.findOneAndUpdate.mockResolvedValue(sol);
      await service.aprobar('507f1f77bcf86cd799439099', undefined, { userId, email: '' });
      expect(solicitudModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ estado: 'pendiente' }),
        expect.objectContaining({ $set: { estado: 'en_proceso' } }),
        expect.anything(),
      );
    });

    it('throws BadRequest when not in pendiente', async () => {
      solicitudModel.findById.mockResolvedValue(makeSolicitud({ estado: 'en_proceso' }));
      await expect(service.aprobar('507f1f77bcf86cd799439099', undefined, { userId, email: '' })).rejects.toThrow(BadRequestException);
    });

    it('throws Conflict when atomic update returns null (race lost)', async () => {
      solicitudModel.findById.mockResolvedValue(makeSolicitud({ estado: 'pendiente' }));
      solicitudModel.findOneAndUpdate.mockResolvedValue(null);
      await expect(service.aprobar('507f1f77bcf86cd799439099', undefined, { userId, email: '' })).rejects.toThrow(ConflictException);
    });
  });

  describe('cancelar / reagendar', () => {
    it('blocks cancelar on tipo=manual', async () => {
      solicitudModel.findById.mockResolvedValue(makeSolicitud({ tipo: 'manual' }));
      await expect(service.cancelar('507f1f77bcf86cd799439099', { motivo: 'x' }, { userId, email: '' })).rejects.toThrow(ForbiddenException);
    });

    it('blocks cancelar before fechaVencimiento', async () => {
      const futuro = new Date(Date.now() + 7 * 86400000);
      solicitudModel.findById.mockResolvedValue(makeSolicitud({ tipo: 'compromiso', fechaVencimiento: futuro }));
      await expect(service.cancelar('507f1f77bcf86cd799439099', { motivo: 'x' }, { userId, email: '' })).rejects.toThrow(ForbiddenException);
    });

    it('allows cancelar on or after fechaVencimiento', async () => {
      const ayer = new Date(Date.now() - 86400000);
      const sol = makeSolicitud({ tipo: 'compromiso', fechaVencimiento: ayer, estado: 'pendiente' });
      solicitudModel.findById.mockResolvedValue(sol);
      solicitudModel.findOneAndUpdate.mockResolvedValue(sol);
      await service.cancelar('507f1f77bcf86cd799439099', { motivo: 'sin fondos' }, { userId, email: '' });
      expect(solicitudModel.findOneAndUpdate).toHaveBeenCalled();
    });

    it('reagendar requires future date', async () => {
      const ayer = new Date(Date.now() - 86400000);
      solicitudModel.findById.mockResolvedValue(makeSolicitud({ tipo: 'compromiso', fechaVencimiento: ayer }));
      const pasado = new Date(Date.now() - 1000).toISOString();
      await expect(service.reagendar('507f1f77bcf86cd799439099', { nuevaFecha: pasado } as any, { userId, email: '' })).rejects.toThrow(/futura/);
    });
  });
});
