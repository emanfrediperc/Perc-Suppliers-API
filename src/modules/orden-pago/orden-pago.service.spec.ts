/**
 * Unit tests para OrdenPagoService.
 * Cubre:
 *   - create(): la orden nace en 'esperando_aprobacion' y dispara el gate de aprobacion
 *   - deactivate(): guard de orden pagada / inexistente
 *   - pagar(): guards de no encontrada / ya pagada / monto excede saldo (cortan antes de la transaccion)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { OrdenPagoService } from './orden-pago.service';
import { OrdenPago } from './schemas/orden-pago.schema';
import { Factura } from '../factura/schemas/factura.schema';
import { Pago } from '../pago/schemas/pago.schema';
import { Convenio } from '../convenio/schemas/convenio.schema';
import { EmpresaProveedora } from '../empresa-proveedora/schemas/empresa-proveedora.schema';
import { EmpresaCliente } from '../empresa-cliente/schemas/empresa-cliente.schema';
import { PagoCalculatorService } from '../../common/services/pago-calculator.service';
import { AprobacionService } from '../aprobacion/aprobacion.service';

// Query mock encadenable (.populate().populate().session()) y awaitable.
function query<T>(value: T) {
  const q: any = {};
  q.populate = jest.fn(() => q);
  q.session = jest.fn(() => q);
  q.then = (resolve: (v: T) => void) => resolve(value);
  return q;
}

describe('OrdenPagoService', () => {
  let service: OrdenPagoService;
  let ordenModel: any;
  let connection: any;
  let aprobacionService: { createAprobacion: jest.Mock };

  beforeEach(async () => {
    ordenModel = { create: jest.fn(), findById: jest.fn() };
    connection = { startSession: jest.fn() };
    aprobacionService = { createAprobacion: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        OrdenPagoService,
        { provide: getModelToken(OrdenPago.name), useValue: ordenModel },
        { provide: getModelToken(Factura.name), useValue: {} },
        { provide: getModelToken(Pago.name), useValue: {} },
        { provide: getModelToken(Convenio.name), useValue: {} },
        { provide: getModelToken(EmpresaProveedora.name), useValue: {} },
        { provide: getModelToken(EmpresaCliente.name), useValue: {} },
        { provide: 'FINNEGANS_SERVICE', useValue: {} },
        { provide: getConnectionToken(), useValue: connection },
        { provide: PagoCalculatorService, useValue: { calculate: jest.fn() } },
        { provide: AprobacionService, useValue: aprobacionService },
      ],
    }).compile();

    service = moduleRef.get(OrdenPagoService);
  });

  describe('create()', () => {
    const user = { userId: 'u1', email: 'tesoreria@perc.com' };
    const dto: any = { numero: 'OP-1', montoTotal: 150000, moneda: 'ARS' };

    beforeEach(() => {
      const session = { withTransaction: jest.fn(async (cb: any) => cb()), endSession: jest.fn() };
      connection.startSession.mockResolvedValue(session);
      ordenModel.create.mockResolvedValue([{ _id: { toString: () => 'orden1' } }]);
    });

    it('crea la orden en estado esperando_aprobacion', async () => {
      aprobacionService.createAprobacion.mockResolvedValue({});
      await service.create(dto, user);
      expect(ordenModel.create).toHaveBeenCalledWith(
        [expect.objectContaining({ numero: 'OP-1', estado: 'esperando_aprobacion' })],
        expect.objectContaining({ session: expect.anything() }),
      );
    });

    it('dispara el gate de aprobacion con la entidad/monto correctos', async () => {
      aprobacionService.createAprobacion.mockResolvedValue({});
      await service.create(dto, user);
      expect(aprobacionService.createAprobacion).toHaveBeenCalledWith(
        expect.objectContaining({ entidad: 'ordenes-pago', entidadId: 'orden1', monto: 150000, createdBy: 'u1' }),
      );
    });

    it('propaga si no hay aprobadores (createAprobacion lanza)', async () => {
      aprobacionService.createAprobacion.mockRejectedValue(new BadRequestException('Sin aprobadores'));
      await expect(service.create(dto, user)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('deactivate()', () => {
    it('lanza NotFound si no existe', async () => {
      ordenModel.findById.mockResolvedValue(null);
      await expect(service.deactivate('x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lanza BadRequest si la orden esta pagada', async () => {
      ordenModel.findById.mockResolvedValue({ estado: 'pagada' });
      await expect(service.deactivate('x')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('desactiva (activo=false) una orden no pagada', async () => {
      const doc: any = { estado: 'parcial', save: jest.fn().mockResolvedValue(undefined) };
      ordenModel.findById.mockResolvedValue(doc);
      await service.deactivate('x');
      expect(doc.activo).toBe(false);
      expect(doc.save).toHaveBeenCalled();
    });
  });

  describe('update() — mass-assignment de monto/estado/ownership (regresion seguridad)', () => {
    it('NO permite mutar montoTotal de una orden ya aprobada via PATCH', async () => {
      const updated: any = { _id: 'orden1', montoTotal: 90000, estado: 'pendiente' };
      ordenModel.findByIdAndUpdate = jest.fn().mockResolvedValue(updated);

      await service.update('orden1', { montoTotal: 8000000 } as any);

      // El campo montoTotal nunca debe llegar al update (se sanitiza antes)
      const [, persisted] = ordenModel.findByIdAndUpdate.mock.calls[0];
      expect(persisted).not.toHaveProperty('montoTotal');
    });

    it('elimina estado, empresaProveedora, facturas, saldoPendiente y montoPagado del update', async () => {
      const updated: any = { _id: 'orden1', estado: 'pendiente' };
      ordenModel.findByIdAndUpdate = jest.fn().mockResolvedValue(updated);

      await service.update('orden1', {
        montoTotal: 8000000,
        estado: 'pagada',
        empresaProveedora: 'otro-prov',
        facturas: ['f1'],
        saldoPendiente: 999,
        montoPagado: -100,
        moneda: 'USD',
      } as any);

      const [, persisted] = ordenModel.findByIdAndUpdate.mock.calls[0];
      for (const campo of ['montoTotal', 'estado', 'empresaProveedora', 'facturas', 'saldoPendiente', 'montoPagado']) {
        expect(persisted).not.toHaveProperty(campo);
      }
      // Los campos seguros si pasan
      expect(persisted).toHaveProperty('moneda', 'USD');
    });

    it('lanza NotFound si la orden no existe', async () => {
      ordenModel.findByIdAndUpdate = jest.fn().mockResolvedValue(null);
      await expect(service.update('x', { moneda: 'USD' } as any)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('pagar() — guards (dentro de la transaccion)', () => {
    beforeEach(() => {
      connection.startSession.mockResolvedValue({
        withTransaction: async (cb: any) => cb(),
        endSession: jest.fn(),
      });
    });

    it('lanza NotFound si la orden no existe', async () => {
      ordenModel.findById.mockReturnValue(query(null));
      await expect(service.pagar('x', { montoBase: 100, medioPago: 'transferencia' } as any)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lanza BadRequest si la orden ya esta pagada', async () => {
      ordenModel.findById.mockReturnValue(query({ estado: 'pagada' }));
      await expect(service.pagar('x', { montoBase: 100, medioPago: 'transferencia' } as any)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lanza BadRequest si el monto excede el saldo pendiente', async () => {
      ordenModel.findById.mockReturnValue(query({ estado: 'parcial', montoTotal: 1000, montoPagado: 0 }));
      await expect(service.pagar('x', { montoBase: 5000, medioPago: 'transferencia' } as any)).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
