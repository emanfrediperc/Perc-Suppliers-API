/**
 * Unit tests para PagoProgramadoService — gate de aprobacion en create(),
 * guards de cancelar y el cron de ejecucion.
 *
 * Regresion de seguridad (cluster pagos-mass-assign):
 *   - create() ya NO persiste un pago programado "listo para ejecutar": nace en
 *     'esperando_aprobacion' y dispara el gate de aprobacion (createAprobacion).
 *   - el cron solo ejecuta los que pasaron el gate (estado 'programado').
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PagoProgramadoService } from './pago-programado.service';
import { PagoProgramado } from './schemas/pago-programado.schema';
import { OrdenPagoService } from '../orden-pago/orden-pago.service';
import { AprobacionService } from '../aprobacion/aprobacion.service';

function query<T>(value: T) {
  const q: any = {};
  q.populate = jest.fn(() => q);
  q.then = (resolve: (v: T) => void) => resolve(value);
  return q;
}

describe('PagoProgramadoService', () => {
  let service: PagoProgramadoService;
  let model: any;
  let connection: any;
  let ordenPagoService: { pagar: jest.Mock };
  let aprobacionService: { createAprobacion: jest.Mock };

  beforeEach(async () => {
    model = { create: jest.fn(), find: jest.fn(), findById: jest.fn(), countDocuments: jest.fn() };
    connection = { startSession: jest.fn() };
    ordenPagoService = { pagar: jest.fn() };
    aprobacionService = { createAprobacion: jest.fn() };
    const ref: TestingModule = await Test.createTestingModule({
      providers: [
        PagoProgramadoService,
        { provide: getModelToken(PagoProgramado.name), useValue: model },
        { provide: getConnectionToken(), useValue: connection },
        { provide: OrdenPagoService, useValue: ordenPagoService },
        { provide: AprobacionService, useValue: aprobacionService },
      ],
    }).compile();
    service = ref.get(PagoProgramadoService);
  });

  describe('create() — gate de aprobacion (regresion seguridad)', () => {
    const user = { userId: 'u1', email: 'tesoreria@perc.com' };
    const dto: any = { ordenPago: 'o1', montoBase: 500000, medioPago: 'transferencia', fechaProgramada: '2026-06-01' };

    beforeEach(() => {
      const session = { withTransaction: jest.fn(async (cb: any) => cb()), endSession: jest.fn() };
      connection.startSession.mockResolvedValue(session);
      model.create.mockResolvedValue([{ _id: { toString: () => 'pp1' } }]);
    });

    it('persiste el pago programado en estado esperando_aprobacion (NO programado)', async () => {
      aprobacionService.createAprobacion.mockResolvedValue({});
      await service.create(dto, user);
      expect(model.create).toHaveBeenCalledWith(
        [expect.objectContaining({ ordenPago: 'o1', estado: 'esperando_aprobacion' })],
        expect.objectContaining({ session: expect.anything() }),
      );
      // El estado NUNCA debe nacer como 'programado' (ejecutable por el cron sin aprobar)
      const persisted = model.create.mock.calls[0][0][0];
      expect(persisted.estado).not.toBe('programado');
    });

    it('dispara el gate de aprobacion con entidad/monto correctos', async () => {
      aprobacionService.createAprobacion.mockResolvedValue({});
      await service.create(dto, user);
      expect(aprobacionService.createAprobacion).toHaveBeenCalledWith(
        expect.objectContaining({ entidad: 'pagos-programados', entidadId: 'pp1', monto: 500000, createdBy: 'u1' }),
      );
    });

    it('aborta si no hay aprobadores (createAprobacion lanza)', async () => {
      aprobacionService.createAprobacion.mockRejectedValue(new BadRequestException('Sin aprobadores'));
      await expect(service.create(dto, user)).rejects.toBeInstanceOf(BadRequestException);
    });
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
    it('rechaza cancelar (BadRequest) si ya esta ejecutado', async () => {
      model.findById.mockResolvedValue({ estado: 'ejecutado' });
      await expect(service.cancelar('x')).rejects.toBeInstanceOf(BadRequestException);
    });
    it('cancela un pago programado en estado programado', async () => {
      const pp: any = { estado: 'programado', save: jest.fn().mockResolvedValue(undefined) };
      model.findById.mockResolvedValue(pp);
      await service.cancelar('x');
      expect(pp.estado).toBe('cancelado');
      expect(pp.save).toHaveBeenCalled();
    });
    it('permite cancelar uno en esperando_aprobacion (el creador retira la solicitud)', async () => {
      const pp: any = { estado: 'esperando_aprobacion', save: jest.fn().mockResolvedValue(undefined) };
      model.findById.mockResolvedValue(pp);
      await service.cancelar('x');
      expect(pp.estado).toBe('cancelado');
    });
  });

  describe('ejecutarPagosProgramados() [cron]', () => {
    const makePP = () => ({
      _id: 'pp1', ordenPago: { toString: () => 'o1' }, montoBase: 1000, medioPago: 'transferencia',
      fechaProgramada: new Date('2026-06-01'), estado: 'programado',
      save: jest.fn().mockResolvedValue(undefined),
    });

    it('solo consulta los pagos programados ya APROBADOS (estado programado)', async () => {
      model.find.mockResolvedValue([]);
      await service.ejecutarPagosProgramados();
      expect(model.find).toHaveBeenCalledWith(
        expect.objectContaining({ estado: 'programado' }),
      );
      // Nunca debe ejecutar items en espera de aprobacion
      const filtro = model.find.mock.calls[0][0];
      expect(filtro.estado).not.toBe('esperando_aprobacion');
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
