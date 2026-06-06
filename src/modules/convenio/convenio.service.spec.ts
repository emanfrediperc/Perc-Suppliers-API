/**
 * Unit tests para ConvenioService.
 * Cubre: guards 404 (findOne/update), y addEmpresa (linkeo bidireccional + 404s).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { ConvenioService } from './convenio.service';
import { Convenio } from './schemas/convenio.schema';
import { EmpresaProveedora } from '../empresa-proveedora/schemas/empresa-proveedora.schema';
import { Factura } from '../factura/schemas/factura.schema';
import { Pago } from '../pago/schemas/pago.schema';
import { ExportService } from '../../common/services/export.service';

function query<T>(value: T) {
  const q: any = {};
  q.populate = jest.fn(() => q);
  q.then = (resolve: (v: T) => void) => resolve(value);
  return q;
}

describe('ConvenioService', () => {
  let service: ConvenioService;
  let convenioModel: any;
  let empresaModel: any;

  beforeEach(async () => {
    convenioModel = { findById: jest.fn(), findByIdAndUpdate: jest.fn() };
    empresaModel = { findById: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ConvenioService,
        { provide: getModelToken(Convenio.name), useValue: convenioModel },
        { provide: getModelToken(EmpresaProveedora.name), useValue: empresaModel },
        { provide: getModelToken(Factura.name), useValue: {} },
        { provide: getModelToken(Pago.name), useValue: {} },
        { provide: ExportService, useValue: { generateExcel: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(ConvenioService);
  });

  describe('guards 404', () => {
    it('findOne lanza NotFound si no existe', async () => {
      convenioModel.findById.mockReturnValue(query(null));
      await expect(service.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('update lanza NotFound si no existe', async () => {
      convenioModel.findByIdAndUpdate.mockResolvedValue(null);
      await expect(service.update('x', {} as any)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('addEmpresa()', () => {
    const convenioId = new Types.ObjectId().toString();
    const empresaId = new Types.ObjectId().toString();

    it('lanza NotFound si el convenio no existe', async () => {
      convenioModel.findById.mockReturnValue(query(null));
      await expect(service.addEmpresa(convenioId, empresaId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lanza NotFound si la empresa no existe', async () => {
      convenioModel.findById.mockReturnValue(query({ empresasProveedoras: [], save: jest.fn() }));
      empresaModel.findById.mockResolvedValue(null);
      await expect(service.addEmpresa(convenioId, empresaId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('linkea ambos lados y persiste', async () => {
      const convenioDoc: any = { empresasProveedoras: [], save: jest.fn().mockResolvedValue(undefined) };
      const empresaDoc: any = { convenios: [], save: jest.fn().mockResolvedValue(undefined) };
      convenioModel.findById.mockReturnValue(query(convenioDoc));
      empresaModel.findById.mockResolvedValue(empresaDoc);

      await service.addEmpresa(convenioId, empresaId);

      expect(convenioDoc.empresasProveedoras).toHaveLength(1);
      expect(empresaDoc.convenios).toHaveLength(1);
      expect(convenioDoc.save).toHaveBeenCalled();
      expect(empresaDoc.save).toHaveBeenCalled();
    });

    it('no duplica si la empresa ya esta vinculada', async () => {
      const eId = new Types.ObjectId(empresaId);
      const convenioDoc: any = { empresasProveedoras: [eId], save: jest.fn() };
      const empresaDoc: any = { convenios: [new Types.ObjectId(convenioId)], save: jest.fn() };
      convenioModel.findById.mockReturnValue(query(convenioDoc));
      empresaModel.findById.mockResolvedValue(empresaDoc);

      await service.addEmpresa(convenioId, empresaId);

      expect(convenioDoc.empresasProveedoras).toHaveLength(1);
      expect(convenioDoc.save).not.toHaveBeenCalled();
      expect(empresaDoc.save).not.toHaveBeenCalled();
    });
  });
});
