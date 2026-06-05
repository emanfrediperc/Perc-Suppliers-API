/**
 * Unit tests para PagoService.anular() — guardas de estado.
 *
 * Cubre:
 *   - pago inexistente → NotFoundException
 *   - estado === 'anulado' → BadRequestException (ya anulado)
 *   - estado === 'esperando_aprobacion' → BadRequestException (debe rechazarse via flujo de aprobacion)
 *
 * Las tres guardas disparan ANTES de abrir la transaccion (connection.startSession),
 * por lo que basta con stubear pagoModel.findById; no se mockea la sesion.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PagoService } from './pago.service';
import { Pago } from './schemas/pago.schema';
import { Factura } from '../factura/schemas/factura.schema';
import { OrdenPago } from '../orden-pago/schemas/orden-pago.schema';
import { AprobacionService } from '../aprobacion/aprobacion.service';

describe('PagoService.anular() — guardas de estado', () => {
  let service: PagoService;
  let pagoModel: { findById: jest.Mock };
  let connection: { startSession: jest.Mock };

  beforeEach(async () => {
    pagoModel = { findById: jest.fn() };
    connection = { startSession: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PagoService,
        { provide: getModelToken(Pago.name), useValue: pagoModel },
        { provide: getModelToken(Factura.name), useValue: {} },
        { provide: getModelToken(OrdenPago.name), useValue: {} },
        { provide: getConnectionToken(), useValue: connection },
        { provide: AprobacionService, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(PagoService);
  });

  it('lanza NotFoundException si el pago no existe', async () => {
    pagoModel.findById.mockResolvedValue(null);

    await expect(service.anular('inexistente')).rejects.toBeInstanceOf(NotFoundException);
    expect(connection.startSession).not.toHaveBeenCalled();
  });

  it('lanza BadRequestException si el pago ya esta anulado', async () => {
    pagoModel.findById.mockResolvedValue({ _id: 'p1', estado: 'anulado' });

    await expect(service.anular('p1')).rejects.toBeInstanceOf(BadRequestException);
    expect(connection.startSession).not.toHaveBeenCalled();
  });

  it('lanza BadRequestException si el pago esta esperando aprobacion', async () => {
    pagoModel.findById.mockResolvedValue({ _id: 'p2', estado: 'esperando_aprobacion' });

    await expect(service.anular('p2')).rejects.toBeInstanceOf(BadRequestException);
    // La guarda corta antes de abrir la transaccion
    expect(connection.startSession).not.toHaveBeenCalled();
  });
});
