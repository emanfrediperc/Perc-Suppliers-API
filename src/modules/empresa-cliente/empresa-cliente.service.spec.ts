/**
 * Unit tests para EmpresaClienteService (CRUD + guard de CUIT duplicado).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException, NotFoundException } from '@nestjs/common';

import { EmpresaClienteService } from './empresa-cliente.service';
import { EmpresaCliente } from './schemas/empresa-cliente.schema';

describe('EmpresaClienteService', () => {
  let service: EmpresaClienteService;
  let model: any;

  beforeEach(async () => {
    model = { findOne: jest.fn(), findById: jest.fn(), findByIdAndUpdate: jest.fn(), create: jest.fn() };
    const ref: TestingModule = await Test.createTestingModule({
      providers: [
        EmpresaClienteService,
        { provide: getModelToken(EmpresaCliente.name), useValue: model },
      ],
    }).compile();
    service = ref.get(EmpresaClienteService);
  });

  describe('create()', () => {
    it('lanza Conflict si el CUIT ya existe', async () => {
      model.findOne.mockResolvedValue({ _id: 'x' });
      await expect(service.create({ cuit: '20-12345678-6' } as any)).rejects.toBeInstanceOf(ConflictException);
      expect(model.create).not.toHaveBeenCalled();
    });

    it('crea si el CUIT es nuevo', async () => {
      model.findOne.mockResolvedValue(null);
      model.create.mockResolvedValue({ _id: 'c1' });
      const r = await service.create({ cuit: '20-12345678-6', razonSocial: 'ACME' } as any);
      expect(model.create).toHaveBeenCalledWith(expect.objectContaining({ cuit: '20-12345678-6' }));
      expect(r).toEqual({ _id: 'c1' });
    });
  });

  describe('findOne()', () => {
    it('lanza NotFound si no existe', async () => {
      model.findById.mockResolvedValue(null);
      await expect(service.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
    });
    it('devuelve la empresa si existe', async () => {
      model.findById.mockResolvedValue({ _id: 'c1' });
      expect(await service.findOne('c1')).toEqual({ _id: 'c1' });
    });
  });

  describe('update()', () => {
    it('lanza NotFound si no existe', async () => {
      model.findByIdAndUpdate.mockResolvedValue(null);
      await expect(service.update('x', {} as any)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
