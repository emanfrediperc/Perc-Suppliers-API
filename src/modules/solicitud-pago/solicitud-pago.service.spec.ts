import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
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
import { HashChainService } from '../../common/services/hash-chain.service';
import { TsaClient } from '../../common/services/tsa.client';
import { ExportService } from '../../common/services/export.service';

describe('SolicitudPagoService — state machine', () => {
  let service: SolicitudPagoService;
  let solicitudModel: any;
  let facturaModel: any;
  let pagoModel: any;
  let ordenModel: any;
  let convenioModel: any;
  let storageService: any;
  let connection: any;
  const userId = '507f1f77bcf86cd799439011';
  const facturaId = '507f1f77bcf86cd799439020';
  const ordenId = '507f1f77bcf86cd799439030';

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
      historial: [
        {
          accion: 'crear',
          usuario: new Types.ObjectId(userId),
          estadoNuevo: 'pendiente',
          fecha: new Date(),
          hash: 'abc',
        },
      ],
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
      updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
      find: jest.fn(),
    };
    facturaModel = {
      findById: jest.fn(),
    };
    pagoModel = {
      create: jest.fn().mockResolvedValue([{ _id: new Types.ObjectId() }]),
      find: jest.fn().mockReturnValue({
        session: () => ({ lean: () => Promise.resolve([]) }),
        lean: () => Promise.resolve([]),
      }),
    };
    ordenModel = { findById: jest.fn() };
    convenioModel = {
      findOne: jest.fn().mockReturnValue({
        session: () => ({ lean: () => Promise.resolve(null) }),
        lean: () => Promise.resolve(null),
      }),
    };
    storageService = { upload: jest.fn(), getSignedDownloadUrl: jest.fn() };
    const session = {
      withTransaction: jest.fn(async (cb: any) => cb()),
      endSession: jest.fn(),
    };
    connection = { startSession: jest.fn().mockResolvedValue(session) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SolicitudPagoService,
        {
          provide: getModelToken(SolicitudPago.name),
          useValue: solicitudModel,
        },
        { provide: getModelToken(Factura.name), useValue: facturaModel },
        { provide: getModelToken(Pago.name), useValue: pagoModel },
        { provide: getModelToken(OrdenPago.name), useValue: ordenModel },
        { provide: getModelToken(Convenio.name), useValue: convenioModel },
        {
          provide: getModelToken(User.name),
          useValue: {
            find: jest.fn().mockReturnValue({
              select: () => ({ lean: () => Promise.resolve([]) }),
            }),
          },
        },
        { provide: getConnectionToken(), useValue: connection },
        {
          provide: StorageService,
          useValue: storageService,
        },
        {
          provide: PagoCalculatorService,
          useValue: {
            calculate: jest.fn().mockReturnValue({
              comision: 0,
              porcentajeComision: 0,
              descuento: 0,
              porcentajeDescuento: 0,
              totalRetenciones: 0,
              montoNeto: 0,
            }),
          },
        },
        { provide: EmailService, useValue: { sendEmail: jest.fn() } },
        { provide: ConfigService, useValue: { get: () => '' } },
        HashChainService,
        {
          provide: TsaClient,
          useValue: {
            timestamp: jest.fn().mockResolvedValue({ token: null }),
            isEnabled: () => false,
          },
        },
        {
          provide: ExportService,
          useValue: {
            generateExcel: jest.fn().mockResolvedValue(Buffer.from('')),
          },
        },
      ],
    }).compile();

    service = module.get(SolicitudPagoService);
  });

  // ─── create ──────────────────────────────────────────────────────────

  describe('create', () => {
    it('rejects monto > saldoPendiente', async () => {
      facturaModel.findById.mockResolvedValue(
        makeFactura({ saldoPendiente: 1000 }),
      );
      solicitudModel.find.mockReturnValue({ lean: () => Promise.resolve([]) });
      await expect(
        service.create(
          {
            factura: facturaId,
            tipo: 'manual',
            monto: 5000,
            medioPago: 'transferencia',
          } as any,
          { userId, email: '' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects oversubscription across pending solicitudes', async () => {
      facturaModel.findById.mockResolvedValue(
        makeFactura({ saldoPendiente: 1000 }),
      );
      solicitudModel.find.mockReturnValue({
        lean: () => Promise.resolve([{ monto: 600 }, { monto: 300 }]),
      });
      // saldo 1000, ya comprometido 900, disponible 100. Pido 200 → debe rechazar.
      await expect(
        service.create(
          {
            factura: facturaId,
            tipo: 'manual',
            monto: 200,
            medioPago: 'transferencia',
          } as any,
          { userId, email: '' },
        ),
      ).rejects.toThrow(/excede saldo disponible/);
    });

    it('rejects compromiso without fechaVencimiento', async () => {
      facturaModel.findById.mockResolvedValue(makeFactura());
      solicitudModel.find.mockReturnValue({ lean: () => Promise.resolve([]) });
      await expect(
        service.create(
          {
            factura: facturaId,
            tipo: 'compromiso',
            monto: 1000,
            medioPago: 'transferencia',
          } as any,
          { userId, email: '' },
        ),
      ).rejects.toThrow(/fechaVencimiento/);
    });

    it('rejects compromiso with past fechaVencimiento', async () => {
      facturaModel.findById.mockResolvedValue(makeFactura());
      solicitudModel.find.mockReturnValue({ lean: () => Promise.resolve([]) });
      const ayer = new Date(Date.now() - 86400000).toISOString();
      await expect(
        service.create(
          {
            factura: facturaId,
            tipo: 'compromiso',
            monto: 1000,
            fechaVencimiento: ayer,
            medioPago: 'transferencia',
          } as any,
          { userId, email: '' },
        ),
      ).rejects.toThrow(/futura/);
    });

    it('rejects when factura is anulada or pagada', async () => {
      facturaModel.findById.mockResolvedValue(
        makeFactura({ estado: 'pagada' }),
      );
      solicitudModel.find.mockReturnValue({ lean: () => Promise.resolve([]) });
      await expect(
        service.create(
          {
            factura: facturaId,
            tipo: 'manual',
            monto: 1000,
            medioPago: 'transferencia',
          } as any,
          { userId, email: '' },
        ),
      ).rejects.toThrow(/no admite/);
    });

    it('requires either factura or ordenPago, not both nor neither', async () => {
      await expect(
        service.create(
          { tipo: 'manual', monto: 1000, medioPago: 'transferencia' } as any,
          { userId, email: '' },
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create(
          {
            factura: facturaId,
            ordenPago: facturaId,
            tipo: 'manual',
            monto: 1000,
            medioPago: 'transferencia',
          } as any,
          { userId, email: '' },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── transitions ─────────────────────────────────────────────────────

  describe('aprobar', () => {
    it('transitions pendiente → en_proceso atomically', async () => {
      const sol = makeSolicitud({ estado: 'pendiente' });
      solicitudModel.findById.mockResolvedValue(sol);
      solicitudModel.findOneAndUpdate.mockResolvedValue(sol);
      await service.aprobar('507f1f77bcf86cd799439099', undefined, {
        userId,
        email: '',
      });
      expect(solicitudModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ estado: 'pendiente' }),
        expect.objectContaining({ $set: { estado: 'en_proceso' } }),
        expect.anything(),
      );
    });

    it('throws BadRequest when not in pendiente', async () => {
      solicitudModel.findById.mockResolvedValue(
        makeSolicitud({ estado: 'en_proceso' }),
      );
      await expect(
        service.aprobar('507f1f77bcf86cd799439099', undefined, {
          userId,
          email: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws Conflict when atomic update returns null (race lost)', async () => {
      solicitudModel.findById.mockResolvedValue(
        makeSolicitud({ estado: 'pendiente' }),
      );
      solicitudModel.findOneAndUpdate.mockResolvedValue(null);
      await expect(
        service.aprobar('507f1f77bcf86cd799439099', undefined, {
          userId,
          email: '',
        }),
      ).rejects.toThrow(ConflictException);
    });

    // ── Segregación de funciones (cuatro ojos sobre el flujo de dinero) ──
    // Regresión del hallazgo: el creador de la solicitud (incl. admin) NO debe
    // poder aprobarla. Antes del fix, transicion() no comparaba createdBy.user
    // contra user.userId y un admin podía crear+aprobar+ejecutar+procesar solo.
    it('bloquea self-approval: el creador NO puede aprobar su propia solicitud', async () => {
      const sol = makeSolicitud({
        estado: 'pendiente',
        createdBy: { user: new Types.ObjectId(userId) },
      });
      solicitudModel.findById.mockResolvedValue(sol);
      solicitudModel.findOneAndUpdate.mockResolvedValue(sol);

      await expect(
        service.aprobar('507f1f77bcf86cd799439099', undefined, {
          userId, // mismo actor que creó (createdBy.user)
          email: '',
          role: 'admin',
        }),
      ).rejects.toThrow(ForbiddenException);

      // El ataque queda cerrado: nunca se transiciona el estado.
      expect(solicitudModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('permite aprobar cuando el aprobador es un actor DISTINTO al creador', async () => {
      const otroCreador = new Types.ObjectId().toString();
      const sol = makeSolicitud({
        estado: 'pendiente',
        createdBy: { user: new Types.ObjectId(otroCreador) },
      });
      solicitudModel.findById.mockResolvedValue(sol);
      solicitudModel.findOneAndUpdate.mockResolvedValue(sol);

      await service.aprobar('507f1f77bcf86cd799439099', undefined, {
        userId, // distinto de otroCreador
        email: '',
        role: 'contabilidad',
      });

      expect(solicitudModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ estado: 'pendiente' }),
        expect.objectContaining({ $set: { estado: 'en_proceso' } }),
        expect.anything(),
      );
    });
  });

  describe('cancelar / reagendar', () => {
    it('blocks cancelar on tipo=manual', async () => {
      solicitudModel.findById.mockResolvedValue(
        makeSolicitud({ tipo: 'manual' }),
      );
      await expect(
        service.cancelar(
          '507f1f77bcf86cd799439099',
          { motivo: 'x' },
          { userId, email: '' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks cancelar before fechaVencimiento', async () => {
      const futuro = new Date(Date.now() + 7 * 86400000);
      solicitudModel.findById.mockResolvedValue(
        makeSolicitud({ tipo: 'compromiso', fechaVencimiento: futuro }),
      );
      await expect(
        service.cancelar(
          '507f1f77bcf86cd799439099',
          { motivo: 'x' },
          { userId, email: '' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows cancelar on or after fechaVencimiento', async () => {
      const ayer = new Date(Date.now() - 86400000);
      const sol = makeSolicitud({
        tipo: 'compromiso',
        fechaVencimiento: ayer,
        estado: 'pendiente',
      });
      solicitudModel.findById.mockResolvedValue(sol);
      solicitudModel.findOneAndUpdate.mockResolvedValue(sol);
      await service.cancelar(
        '507f1f77bcf86cd799439099',
        { motivo: 'sin fondos' },
        { userId, email: '' },
      );
      expect(solicitudModel.findOneAndUpdate).toHaveBeenCalled();
    });

    it('reagendar requires future date', async () => {
      const ayer = new Date(Date.now() - 86400000);
      solicitudModel.findById.mockResolvedValue(
        makeSolicitud({ tipo: 'compromiso', fechaVencimiento: ayer }),
      );
      const pasado = new Date(Date.now() - 1000).toISOString();
      await expect(
        service.reagendar(
          '507f1f77bcf86cd799439099',
          { nuevaFecha: pasado } as any,
          { userId, email: '' },
        ),
      ).rejects.toThrow(/futura/);
    });
  });

  // ─── procesar (#7: transacción atómica anti doble-pago) ──────────────
  describe('procesar', () => {
    const procId = '507f1f77bcf86cd799439099';
    const files = {
      perc: { originalname: 'perc.pdf' } as any,
      retenciones: { originalname: 'ret.pdf' } as any,
    };
    const dto = {} as any;

    function setupFacturaFlow(saldoTx: number, saldoPrelim = saldoTx) {
      solicitudModel.findById.mockResolvedValue(
        makeSolicitud({
          estado: 'pago_en_proceso_perc',
          factura: new Types.ObjectId(facturaId),
          monto: 50000,
        }),
      );
      const acquired = makeSolicitud({
        estado: 'procesado',
        factura: new Types.ObjectId(facturaId),
        monto: 50000,
      });
      solicitudModel.findOneAndUpdate.mockResolvedValue(acquired);
      const facturaDoc = makeFactura({
        saldoPendiente: saldoTx,
        montoTotal: 100000,
        montoPagado: 0,
        save: jest.fn().mockResolvedValue(undefined),
      });
      facturaModel.findById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve({ saldoPendiente: saldoPrelim }),
          session: () => Promise.resolve({ saldoPendiente: saldoTx }),
        }),
        session: () => Promise.resolve(facturaDoc),
      });
      storageService.upload.mockResolvedValue({ url: 'u', key: 'k' });
      return { acquired };
    }

    it('crea el Pago DENTRO de la transacción y completa la solicitud (camino feliz)', async () => {
      const { acquired } = setupFacturaFlow(100000); // saldo 100k ≥ monto 50k
      const result = await service.procesar(procId, dto, files, {
        userId,
        email: '',
      });
      expect(connection.startSession).toHaveBeenCalled();
      expect(pagoModel.create).toHaveBeenCalledWith(
        [expect.objectContaining({ montoBase: 50000, estado: 'confirmado' })],
        expect.objectContaining({ session: expect.anything() }),
      );
      expect(acquired.save).toHaveBeenCalled();
      expect(result).toBe(acquired);
    });

    it('aborta con Conflict y revierte el estado si el saldo leído EN LA TRANSACCIÓN ya no cubre (doble-pago)', async () => {
      // pre-check ve 100k (pasa), pero dentro de la tx el saldo es 10k (<50k)
      setupFacturaFlow(10000, 100000);
      await expect(
        service.procesar(procId, dto, files, { userId, email: '' }),
      ).rejects.toThrow(ConflictException);
      expect(solicitudModel.updateOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: { estado: 'pago_en_proceso_perc' },
        }),
      );
    });

    it('rechaza en el pre-check sin subir comprobantes si el saldo ya no alcanza', async () => {
      setupFacturaFlow(0, 10000); // pre-check ve 10k < monto 50k
      await expect(
        service.procesar(procId, dto, files, { userId, email: '' }),
      ).rejects.toThrow(ConflictException);
      expect(storageService.upload).not.toHaveBeenCalled();
      expect(pagoModel.create).not.toHaveBeenCalled();
    });

    it('lanza Conflict si otro usuario ya adquirió el estado procesado', async () => {
      solicitudModel.findById.mockResolvedValue(
        makeSolicitud({
          estado: 'pago_en_proceso_perc',
          factura: new Types.ObjectId(facturaId),
        }),
      );
      solicitudModel.findOneAndUpdate.mockResolvedValue(null);
      await expect(
        service.procesar(procId, dto, files, { userId, email: '' }),
      ).rejects.toThrow(ConflictException);
    });

    it('exige ambos comprobantes (perc y retenciones)', async () => {
      await expect(
        service.procesar(procId, dto, { perc: files.perc } as any, {
          userId,
          email: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('orden: aplica el pago a la orden dentro de la transacción', async () => {
      solicitudModel.findById.mockResolvedValue(
        makeSolicitud({
          estado: 'pago_en_proceso_perc',
          ordenPago: new Types.ObjectId(ordenId),
          monto: 50000,
        }),
      );
      const acquired = makeSolicitud({
        estado: 'procesado',
        ordenPago: new Types.ObjectId(ordenId),
        monto: 50000,
      });
      solicitudModel.findOneAndUpdate.mockResolvedValue(acquired);
      const ordenDoc = {
        _id: new Types.ObjectId(ordenId),
        montoTotal: 100000,
        montoPagado: 0,
        saldoPendiente: 100000,
        facturas: [],
        pagos: [],
        estado: 'pendiente',
        save: jest.fn().mockResolvedValue(undefined),
      };
      ordenModel.findById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve({ saldoPendiente: 100000 }),
          session: () => Promise.resolve({ saldoPendiente: 100000 }),
        }),
        populate: () => ({ session: () => Promise.resolve(ordenDoc) }),
      });
      storageService.upload.mockResolvedValue({ url: 'u', key: 'k' });

      await service.procesar(procId, dto, files, { userId, email: '' });
      expect(ordenDoc.save).toHaveBeenCalledWith(
        expect.objectContaining({ session: expect.anything() }),
      );
      expect(ordenDoc.montoPagado).toBe(50000);
    });
  });
});
