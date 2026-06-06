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

describe('PrestamosService', () => {
  let service: PrestamosService;
  let prestamoModel: any;
  const user = { userId: 'u1', email: 'tesoreria@perc.com' };

  beforeEach(async () => {
    prestamoModel = { findById: jest.fn(), findByIdAndDelete: jest.fn(), create: jest.fn() };
    const ref: TestingModule = await Test.createTestingModule({
      providers: [
        PrestamosService,
        { provide: getModelToken(Prestamo.name), useValue: prestamoModel },
        { provide: getModelToken(EmpresaProveedora.name), useValue: {} },
        { provide: getModelToken(EmpresaCliente.name), useValue: {} },
        { provide: getConnectionToken(), useValue: { startSession: jest.fn() } },
        { provide: AprobacionService, useValue: { createAprobacion: jest.fn() } },
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
      status: PrestamoStatus.ACTIVE, capital: 1000, rate: 5, dueDate: new Date('2026-12-01'),
      vehicle: 'Pagaré', history: [] as any[], save: jest.fn().mockImplementation(function (this: any) { return Promise.resolve(this); }),
      ...over,
    });

    it('lanza BadRequest si el prestamo no esta ACTIVE', async () => {
      prestamoModel.findById.mockReturnValue(execResolving(baseDoc({ status: PrestamoStatus.CLEARED })));
      await expect(service.update('x', { capital: 2000, reason: 'r' } as any)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lanza BadRequest si no hay cambios', async () => {
      prestamoModel.findById.mockReturnValue(execResolving(baseDoc()));
      await expect(service.update('x', { reason: 'r' } as any)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('aplica cambios, agrega history y persiste', async () => {
      const doc = baseDoc();
      prestamoModel.findById.mockReturnValue(execResolving(doc));
      await service.update('x', { capital: 2000, reason: 'ajuste' } as any);
      expect(doc.capital).toBe(2000);
      expect(doc.history).toHaveLength(1);
      expect(doc.save).toHaveBeenCalled();
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
});
