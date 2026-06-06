/**
 * Unit tests para PagoProgramadoService — guards de cancelar y el cron de ejecucion.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';

import { PagoProgramadoService } from './pago-programado.service';
import { PagoProgramado } from './schemas/pago-programado.schema';
import { OrdenPagoService } from '../orden-pago/orden-pago.service';

function query<T>(value: T) {
  const q: any = {};
  q.populate = jest.fn(() => q);
  q.then = (resolve: (v: T) => void) => resolve(value);
  return q;
}

describe('PagoProgramadoService', () => {
  let service: PagoProgramadoService;
  let model: any;
  let ordenPagoService: { pagar: jest.Mock };

  beforeEach(async () => {
    model = { create: jest.fn(), find: jest.fn(), findById: jest.fn(), countDocuments: jest.fn() };
    ordenPagoService = { pagar: jest.fn() };
    const ref: TestingModule = await Test.createTestingModule({
      providers: [
        PagoProgramadoService,
        { provide: getModelToken(PagoProgramado.name), useValue: model },
        { provide: OrdenPagoService, useValue: ordenPagoService },
      ],
    }).compile();
    service = ref.get(PagoProgramadoService);
  });

  describe('findOne()', () => {
    it('lanza NotFound si no existe', async () => {
      model.findById.mockReturnValue(query(null));
      await expect(service.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('cancelar()', () => {
    it('lanza NotFound si no existe', async () => {
      model.findById.mockResolvedValue(null);
      await expect(service.cancelar('x')).rejects.toBeInstanceOf(NotFoundException);
    });
    it('rechaza cancelar si no esta en estado programado', async () => {
      model.findById.mockResolvedValue({ estado: 'ejecutado' });
      await expect(service.cancelar('x')).rejects.toBeInstanceOf(NotFoundException);
    });
    it('cancela un pago programado', async () => {
      const pp: any = { estado: 'programado', save: jest.fn().mockResolvedValue(undefined) };
      model.findById.mockResolvedValue(pp);
      await service.cancelar('x');
      expect(pp.estado).toBe('cancelado');
      expect(pp.save).toHaveBeenCalled();
    });
  });

  describe('ejecutarPagosProgramados() [cron]', () => {
    const makePP = () => ({
      _id: 'pp1', ordenPago: { toString: () => 'o1' }, montoBase: 1000, medioPago: 'transferencia',
      fechaProgramada: new Date('2026-06-01'), estado: 'programado',
      save: jest.fn().mockResolvedValue(undefined),
    });

    it('marca ejecutado y guarda pagoGenerado en exito', async () => {
      const pp: any = makePP();
      model.find.mockResolvedValue([pp]);
      ordenPagoService.pagar.mockResolvedValue({ _id: 'pago1' });
      await service.ejecutarPagosProgramados();
      expect(ordenPagoService.pagar).toHaveBeenCalledWith('o1', expect.objectContaining({ montoBase: 1000 }));
      expect(pp.estado).toBe('ejecutado');
      expect(pp.pagoGenerado).toBe('pago1');
      expect(pp.save).toHaveBeenCalled();
    });

    it('marca fallido y registra el error si pagar() lanza', async () => {
      const pp: any = makePP();
      model.find.mockResolvedValue([pp]);
      ordenPagoService.pagar.mockRejectedValue(new Error('saldo insuficiente'));
      await service.ejecutarPagosProgramados();
      expect(pp.estado).toBe('fallido');
      expect(pp.errorMensaje).toBe('saldo insuficiente');
      expect(pp.save).toHaveBeenCalled();
    });
  });
});
