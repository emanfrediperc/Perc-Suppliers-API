/**
 * Unit tests para FacturaService.
 * Cubre:
 *   - create(): estados/saldo segun tipo (NC vs normal) y bloqueo apocrifo
 *   - deactivate(): guards (no encontrada / pagada)
 *   - pagar(): guards previos a la transaccion
 *   - checkDuplicate(): exacto / sin duplicado
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { FacturaService } from './factura.service';
import { Factura } from './schemas/factura.schema';
import { Pago } from '../pago/schemas/pago.schema';
import { OrdenPago } from '../orden-pago/schemas/orden-pago.schema';
import { Convenio } from '../convenio/schemas/convenio.schema';
import { EmpresaProveedora } from '../empresa-proveedora/schemas/empresa-proveedora.schema';
import { EmpresaCliente } from '../empresa-cliente/schemas/empresa-cliente.schema';
import { StorageService } from '../../integrations/storage/storage.service';
import { GeminiService } from '../../integrations/gemini/gemini.service';
import { PagoCalculatorService } from '../../common/services/pago-calculator.service';
import { AfipService } from '../../integrations/afip/afip.service';
import { ApocrifosService } from '../../integrations/apocrifos/apocrifos.service';

function query<T>(value: T) {
  const q: any = {};
  q.populate = jest.fn(() => q);
  q.then = (resolve: (v: T) => void) => resolve(value);
  return q;
}

describe('FacturaService', () => {
  let service: FacturaService;
  let facturaModel: any;
  let empresaProvModel: any;
  let apocrifosService: { consultar: jest.Mock };
  let afipService: { isConfigured: jest.Mock; consultarCuit: jest.Mock };

  beforeEach(async () => {
    facturaModel = { create: jest.fn(), findById: jest.fn(), findOne: jest.fn() };
    empresaProvModel = { findById: jest.fn() };
    apocrifosService = { consultar: jest.fn() };
    afipService = { isConfigured: jest.fn().mockReturnValue(false), consultarCuit: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        FacturaService,
        { provide: getModelToken(Factura.name), useValue: facturaModel },
        { provide: getModelToken(Pago.name), useValue: {} },
        { provide: getModelToken(OrdenPago.name), useValue: {} },
        { provide: getModelToken(Convenio.name), useValue: { findOne: jest.fn() } },
        { provide: getModelToken(EmpresaProveedora.name), useValue: empresaProvModel },
        { provide: getModelToken(EmpresaCliente.name), useValue: {} },
        { provide: StorageService, useValue: {} },
        { provide: GeminiService, useValue: {} },
        { provide: getConnectionToken(), useValue: { startSession: jest.fn() } },
        { provide: PagoCalculatorService, useValue: { calculate: jest.fn() } },
        { provide: AfipService, useValue: afipService },
        { provide: ApocrifosService, useValue: apocrifosService },
      ],
    }).compile();

    service = moduleRef.get(FacturaService);
  });

  describe('create()', () => {
    beforeEach(() => {
      // bloquearSiApocrifo: findById(id).lean() -> proveedor con cuit
      empresaProvModel.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue({ cuit: '20-00000000-1' }) });
      apocrifosService.consultar.mockResolvedValue({ esApocrifo: false });
      facturaModel.create.mockResolvedValue({ _id: 'f1' });
    });

    it('factura normal: estado pendiente, saldo = montoTotal, montoPagado 0', async () => {
      await service.create({ tipo: 'A', montoTotal: 50000, empresaProveedora: 'p1' } as any);
      expect(facturaModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ estado: 'pendiente', saldoPendiente: 50000, montoPagado: 0 }),
      );
    });

    it('nota de credito (NC-): estado pagada, saldo 0, montoPagado = montoTotal', async () => {
      await service.create({ tipo: 'NC-A', montoTotal: 30000, empresaProveedora: 'p1' } as any);
      expect(facturaModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ estado: 'pagada', saldoPendiente: 0, montoPagado: 30000 }),
      );
    });

    it('bloquea si el proveedor es apocrifo (no crea)', async () => {
      apocrifosService.consultar.mockResolvedValue({ esApocrifo: true, matches: [{ descripcion: 'listado AFIP' }] });
      await expect(service.create({ tipo: 'A', montoTotal: 1000, empresaProveedora: 'p1' } as any))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(facturaModel.create).not.toHaveBeenCalled();
    });
  });

  describe('deactivate()', () => {
    it('lanza NotFound si no existe', async () => {
      facturaModel.findById.mockResolvedValue(null);
      await expect(service.deactivate('x')).rejects.toBeInstanceOf(NotFoundException);
    });
    it('lanza BadRequest si la factura esta pagada', async () => {
      facturaModel.findById.mockResolvedValue({ estado: 'pagada' });
      await expect(service.deactivate('x')).rejects.toBeInstanceOf(BadRequestException);
    });
    it('desactiva (activo=false) una factura no pagada', async () => {
      const doc: any = { estado: 'pendiente', save: jest.fn().mockResolvedValue(undefined) };
      facturaModel.findById.mockResolvedValue(doc);
      await service.deactivate('x');
      expect(doc.activo).toBe(false);
      expect(doc.save).toHaveBeenCalled();
    });
  });

  describe('pagar() — guards', () => {
    it('lanza NotFound si la factura no existe', async () => {
      facturaModel.findById.mockReturnValue(query(null));
      await expect(service.pagar('x', { montoBase: 100, medioPago: 'transferencia' } as any)).rejects.toBeInstanceOf(NotFoundException);
    });
    it('lanza BadRequest si ya esta pagada', async () => {
      facturaModel.findById.mockReturnValue(query({ estado: 'pagada' }));
      await expect(service.pagar('x', { montoBase: 100, medioPago: 'transferencia' } as any)).rejects.toBeInstanceOf(BadRequestException);
    });
    it('lanza BadRequest si el monto excede el saldo', async () => {
      facturaModel.findById.mockReturnValue(query({ estado: 'pendiente', saldoPendiente: 1000, empresaProveedora: { _id: 'p1' } }));
      await expect(service.pagar('x', { montoBase: 5000, medioPago: 'transferencia' } as any)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('checkDuplicate()', () => {
    it('detecta duplicado exacto', async () => {
      facturaModel.findOne.mockReturnValue(query({ _id: 'dup' }));
      const r = await service.checkDuplicate('F-1', 'p1');
      expect(r).toEqual(expect.objectContaining({ isDuplicate: true, type: 'exact' }));
    });
    it('sin duplicado devuelve isDuplicate false', async () => {
      facturaModel.findOne.mockReturnValue(query(null));
      const r = await service.checkDuplicate('F-2', 'p1');
      expect(r).toEqual({ isDuplicate: false });
    });
  });
});
