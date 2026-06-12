/**
 * Unit tests para PrestamosService — guards de estado y reglas de negocio.
 * (renew() se omite: usa transaccion compleja; create() se cubre en sus guards previos.)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';

import { PrestamosService } from './prestamos.service';
import { Prestamo } from './schemas/prestamo.schema';
import { EmpresaProveedora } from '../empresa-proveedora/schemas/empresa-proveedora.schema';
import { EmpresaCliente } from '../empresa-cliente/schemas/empresa-cliente.schema';
import { AprobacionService } from '../aprobacion/aprobacion.service';
import { PrestamoStatus } from './enums/prestamo-status.enum';
import { EmpresaKind } from './enums/empresa-kind.enum';

const execResolving = <T>(v: T) => ({ exec: jest.fn().mockResolvedValue(v) });

/**
 * Sesión Mongoose fake que ejecuta el callback de withTransaction inline.
 * Sirve para los paths transaccionales (create / re-aprobación de capital).
 */
const makeFakeSession = () => ({
  withTransaction: jest.fn(async (cb: () => Promise<unknown>) => cb()),
  startTransaction: jest.fn(),
  commitTransaction: jest.fn().mockResolvedValue(undefined),
  abortTransaction: jest.fn().mockResolvedValue(undefined),
  endSession: jest.fn().mockResolvedValue(undefined),
});

describe('PrestamosService', () => {
  let service: PrestamosService;
  let prestamoModel: any;
  let aprobacionService: { createAprobacion: jest.Mock };
  let connection: { startSession: jest.Mock };
  const user = { userId: 'u1', email: 'tesoreria@perc.com' };

  beforeEach(async () => {
    prestamoModel = { findById: jest.fn(), findByIdAndDelete: jest.fn(), create: jest.fn() };
    aprobacionService = { createAprobacion: jest.fn().mockResolvedValue({}) };
    connection = { startSession: jest.fn(() => makeFakeSession()) };
    const ref: TestingModule = await Test.createTestingModule({
      providers: [
        PrestamosService,
        { provide: getModelToken(Prestamo.name), useValue: prestamoModel },
        { provide: getModelToken(EmpresaProveedora.name), useValue: {} },
        { provide: getModelToken(EmpresaCliente.name), useValue: {} },
        { provide: getConnectionToken(), useValue: connection },
        { provide: AprobacionService, useValue: aprobacionService },
      ],
    }).compile();
    service = ref.get(PrestamosService);
  });

  describe('findOne()', () => {
    it('lanza NotFound si no existe', async () => {
      prestamoModel.findById.mockReturnValue(execResolving(null));
      await expect(service.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create() — guards previos', () => {
    const ref = (id: string) => ({ empresaId: id, empresaKind: EmpresaKind.CLIENTE });

    it('lanza BadRequest si lender y borrower son la misma empresa', async () => {
      const dto: any = { lender: ref('a'), borrower: ref('a'), startDate: '2026-01-01', dueDate: '2026-06-01', capital: 1000, rate: 5, currency: 'ARS', vehicle: 'x' };
      await expect(service.create(dto, user)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lanza BadRequest si dueDate <= startDate', async () => {
      const dto: any = { lender: ref('a'), borrower: ref('b'), startDate: '2026-06-01', dueDate: '2026-05-01', capital: 1000, rate: 5, currency: 'ARS', vehicle: 'x' };
      await expect(service.create(dto, user)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('update()', () => {
    const baseDoc = (over: any = {}) => ({
      _id: { toString: () => 'p1' },
      status: PrestamoStatus.ACTIVE, capital: 1000, rate: 5, dueDate: new Date('2026-12-01'),
      vehicle: 'Pagaré', currency: 'ARS',
      lender: { razonSocialCache: 'Acreedor SA' },
      borrower: { razonSocialCache: 'Deudor SA' },
      history: [] as any[], save: jest.fn().mockImplementation(function (this: any) { return Promise.resolve(this); }),
      ...over,
    });

    it('lanza BadRequest si el prestamo no esta ACTIVE', async () => {
      prestamoModel.findById.mockReturnValue(execResolving(baseDoc({ status: PrestamoStatus.CLEARED })));
      await expect(service.update('x', { capital: 2000, reason: 'r' } as any, user)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lanza BadRequest si no hay cambios', async () => {
      prestamoModel.findById.mockReturnValue(execResolving(baseDoc()));
      await expect(service.update('x', { reason: 'r' } as any, user)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('aplica cambios de campos no-monetarios (rate) in-place, sin re-aprobacion', async () => {
      const doc = baseDoc();
      prestamoModel.findById.mockReturnValue(execResolving(doc));
      await service.update('x', { rate: 12, reason: 'ajuste tasa' } as any, user);
      expect(doc.rate).toBe(12);
      expect(doc.status).toBe(PrestamoStatus.ACTIVE);
      expect(doc.history).toHaveLength(1);
      expect(doc.save).toHaveBeenCalled();
      // Un cambio que NO toca capital NO debe re-disparar el gate de aprobación.
      expect(aprobacionService.createAprobacion).not.toHaveBeenCalled();
    });

    // REGRESIÓN — "Edicion post-aprobacion de capital en Prestamo ACTIVE evade threshold".
    // El cambio de capital ya NO se aplica directo sobre un préstamo ACTIVE: se re-dispara
    // el gate (vuelve a ESPERANDO_APROBACION + nueva Aprobacion sobre el nuevo monto).
    describe('regresión: cambio de capital re-dispara el gate de aprobación', () => {
      it('vuelve a ESPERANDO_APROBACION y crea Aprobacion por el nuevo capital', async () => {
        const doc = baseDoc({ capital: 100_000 });
        prestamoModel.findById.mockReturnValue(execResolving(doc));

        await service.update('x', { capital: 50_000_000, reason: 'ajuste' } as any, user);

        // El préstamo NO queda ACTIVE con el capital inflado: queda esperando aprobación.
        expect(doc.status).toBe(PrestamoStatus.ESPERANDO_APROBACION);
        // El threshold se reevalúa sobre el NUEVO monto, no sobre los 100k originales.
        expect(aprobacionService.createAprobacion).toHaveBeenCalledTimes(1);
        expect(aprobacionService.createAprobacion).toHaveBeenCalledWith(
          expect.objectContaining({
            entidad: 'prestamos',
            entidadId: 'p1',
            monto: 50_000_000,
            createdBy: user.userId,
            createdByEmail: user.email,
          }),
        );
        // El nuevo capital se persiste pero atado a la nueva aprobación (no ACTIVE aún).
        expect(doc.capital).toBe(50_000_000);
        expect(doc.save).toHaveBeenCalled();
      });

      it('si no hay aprobadores activos, aborta y NO deja el préstamo editado/activo', async () => {
        const doc = baseDoc({ capital: 100_000 });
        prestamoModel.findById.mockReturnValue(execResolving(doc));
        aprobacionService.createAprobacion.mockRejectedValueOnce(
          new BadRequestException('No hay usuarios con rol aprobador activos.'),
        );

        await expect(
          service.update('x', { capital: 50_000_000, reason: 'ajuste' } as any, user),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(aprobacionService.createAprobacion).toHaveBeenCalled();
      });
    });
  });

  describe('clear()', () => {
    it('lanza BadRequest si no esta ACTIVE', async () => {
      prestamoModel.findById.mockReturnValue(execResolving({ status: PrestamoStatus.RENEWED }));
      await expect(service.clear('x')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('marca CLEARED y persiste', async () => {
      const doc: any = {
        status: PrestamoStatus.ACTIVE, capital: 100000, rate: 10,
        startDate: new Date('2026-01-01'), dueDate: new Date('2026-12-01'),
        history: [], save: jest.fn().mockImplementation(function (this: any) { return Promise.resolve(this); }),
      };
      prestamoModel.findById.mockReturnValue(execResolving(doc));
      await service.clear('x');
      expect(doc.status).toBe(PrestamoStatus.CLEARED);
      expect(doc.history).toHaveLength(1);
      expect(doc.save).toHaveBeenCalled();
    });
  });

  describe('remove()', () => {
    it('lanza NotFound si no existe', async () => {
      prestamoModel.findById.mockReturnValue(execResolving(null));
      await expect(service.remove('x')).rejects.toBeInstanceOf(NotFoundException);
    });
    it('lanza Conflict si no esta ACTIVE', async () => {
      prestamoModel.findById.mockReturnValue(execResolving({ status: PrestamoStatus.CLEARED }));
      await expect(service.remove('x')).rejects.toBeInstanceOf(ConflictException);
    });
    it('elimina si esta ACTIVE', async () => {
      prestamoModel.findById.mockReturnValue(execResolving({ status: PrestamoStatus.ACTIVE }));
      prestamoModel.findByIdAndDelete.mockReturnValue(execResolving(undefined));
      await service.remove('x');
      expect(prestamoModel.findByIdAndDelete).toHaveBeenCalledWith('x');
    });
  });

  // REGRESIÓN — "renew() de prestamo acepta capital arbitrario sin aprobacion;
  // operador puede crear prestamo ACTIVE". El préstamo renovado ya NO nace ACTIVE:
  // nace en ESPERANDO_APROBACION y se crea una Aprobacion sobre el nuevo capital.
  describe('renew()', () => {
    const oldDoc = (over: any = {}) => ({
      _id: { toString: () => 'old1' },
      status: PrestamoStatus.ACTIVE,
      capital: 100_000, rate: 10,
      startDate: new Date('2026-01-01'), dueDate: new Date('2026-06-01'),
      vehicle: 'Pagaré', currency: 'ARS', balanceCut: 'DIC',
      lender: { razonSocialCache: 'Acreedor SA' },
      borrower: { razonSocialCache: 'Deudor SA' },
      history: [] as any[],
      save: jest.fn().mockImplementation(function (this: any) { return Promise.resolve(this); }),
      ...over,
    });

    const sessionableFindById = (doc: any) => ({
      session: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(doc) }),
    });

    it('lanza BadRequest si el préstamo a renovar no está ACTIVE', async () => {
      prestamoModel.findById.mockReturnValue(sessionableFindById(oldDoc({ status: PrestamoStatus.CLEARED })));
      await expect(
        service.renew('old1', { dueDate: '2027-01-01' } as any, user),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('el préstamo renovado nace en ESPERANDO_APROBACION, no ACTIVE', async () => {
      const old = oldDoc();
      prestamoModel.findById.mockReturnValue(sessionableFindById(old));
      const newDocs: any[] = [];
      prestamoModel.create.mockImplementation(async (arr: any[]) => {
        const created = { ...arr[0], _id: { toString: () => 'new1' } };
        newDocs.push(created);
        return [created];
      });

      const result = await service.renew(
        'old1',
        { capital: 50_000_000, dueDate: '2027-01-01', startDate: '2026-12-01' } as any,
        user,
      );

      // El nuevo préstamo NO nace ACTIVE: queda esperando aprobación.
      expect(result.status).toBe(PrestamoStatus.ESPERANDO_APROBACION);
      expect(old.status).toBe(PrestamoStatus.RENEWED);
    });

    it('crea una Aprobacion sobre el capital renovado (arbitrario) — el threshold lo ve', async () => {
      const old = oldDoc();
      prestamoModel.findById.mockReturnValue(sessionableFindById(old));
      prestamoModel.create.mockImplementation(async (arr: any[]) => [
        { ...arr[0], _id: { toString: () => 'new1' } },
      ]);

      await service.renew(
        'old1',
        { capital: 50_000_000, dueDate: '2027-01-01', startDate: '2026-12-01' } as any,
        user,
      );

      expect(aprobacionService.createAprobacion).toHaveBeenCalledTimes(1);
      expect(aprobacionService.createAprobacion).toHaveBeenCalledWith(
        expect.objectContaining({
          entidad: 'prestamos',
          entidadId: 'new1',
          monto: 50_000_000,
          createdBy: user.userId,
          createdByEmail: user.email,
        }),
      );
    });

    it('si no hay aprobadores activos, aborta la transacción y no deja un ACTIVE colado', async () => {
      const old = oldDoc();
      prestamoModel.findById.mockReturnValue(sessionableFindById(old));
      prestamoModel.create.mockImplementation(async (arr: any[]) => [
        { ...arr[0], _id: { toString: () => 'new1' } },
      ]);
      aprobacionService.createAprobacion.mockRejectedValueOnce(
        new BadRequestException('No hay usuarios con rol aprobador activos.'),
      );

      await expect(
        service.renew('old1', { capital: 50_000_000, dueDate: '2027-01-01' } as any, user),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
