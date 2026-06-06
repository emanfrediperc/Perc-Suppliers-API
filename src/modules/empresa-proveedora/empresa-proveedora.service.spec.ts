/**
 * Unit tests para EmpresaProveedoraService (CRUD, CUIT duplicado, apocrifoOverride).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException, NotFoundException } from '@nestjs/common';

import { EmpresaProveedoraService } from './empresa-proveedora.service';
import { EmpresaProveedora } from './schemas/empresa-proveedora.schema';

describe('EmpresaProveedoraService', () => {
  let service: EmpresaProveedoraService;
  let model: any;
  let finnegans: { createCompanyInERP: jest.Mock };

  beforeEach(async () => {
    model = { findOne: jest.fn(), findById: jest.fn(), findByIdAndUpdate: jest.fn(), create: jest.fn() };
    finnegans = { createCompanyInERP: jest.fn().mockResolvedValue({ finnegansId: 'FIN-1' }) };
    const ref: TestingModule = await Test.createTestingModule({
      providers: [
        EmpresaProveedoraService,
        { provide: getModelToken(EmpresaProveedora.name), useValue: model },
        { provide: 'FINNEGANS_SERVICE', useValue: finnegans },
      ],
    }).compile();
    service = ref.get(EmpresaProveedoraService);
  });

  describe('create()', () => {
    it('lanza Conflict si el CUIT ya existe', async () => {
      model.findOne.mockResolvedValue({ _id: 'x' });
      await expect(service.create({ cuit: '20-12345678-6', razonSocial: 'ACME' } as any)).rejects.toBeInstanceOf(ConflictException);
      expect(model.create).not.toHaveBeenCalled();
    });

    it('crea con el finnegansId del ERP cuando el CUIT es nuevo', async () => {
      model.findOne.mockResolvedValue(null);
      model.create.mockResolvedValue({ _id: 'p1' });
      await service.create({ cuit: '20-12345678-6', razonSocial: 'ACME' } as any);
      expect(finnegans.createCompanyInERP).toHaveBeenCalled();
      expect(model.create).toHaveBeenCalledWith(expect.objectContaining({ cuit: '20-12345678-6', finnegansId: 'FIN-1' }));
    });
  });

  describe('findOne()', () => {
    it('lanza NotFound si no existe', async () => {
      model.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
      await expect(service.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update()', () => {
    it('lanza NotFound si no existe', async () => {
      model.findByIdAndUpdate.mockResolvedValue(null);
      await expect(service.update('x', {} as any)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('setApocrifoOverride()', () => {
    it('exige motivo al activar el override', async () => {
      await expect(service.setApocrifoOverride('p1', true, undefined, 'admin@perc.com')).rejects.toBeInstanceOf(NotFoundException);
      expect(model.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('activa el override con motivo/usuario/fecha', async () => {
      model.findByIdAndUpdate.mockResolvedValue({ _id: 'p1' });
      await service.setApocrifoOverride('p1', true, 'AFIP error', 'admin@perc.com');
      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ apocrifoOverride: true, apocrifoOverrideMotivo: 'AFIP error', apocrifoOverridePor: 'admin@perc.com' }),
        { new: true },
      );
    });

    it('lanza NotFound si la empresa no existe', async () => {
      model.findByIdAndUpdate.mockResolvedValue(null);
      await expect(service.setApocrifoOverride('x', false, undefined, 'admin@perc.com')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
