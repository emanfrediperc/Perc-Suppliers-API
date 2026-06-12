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

describe('PagoService.update() — mass-assignment de montos (regresion seguridad)', () => {
  let service: PagoService;
  let pagoModel: { findByIdAndUpdate: jest.Mock };

  beforeEach(async () => {
    pagoModel = { findByIdAndUpdate: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PagoService,
        { provide: getModelToken(Pago.name), useValue: pagoModel },
        { provide: getModelToken(Factura.name), useValue: {} },
        { provide: getModelToken(OrdenPago.name), useValue: {} },
        { provide: getConnectionToken(), useValue: { startSession: jest.fn() } },
        { provide: AprobacionService, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(PagoService);
  });

  it('NO permite reescribir montoBase/montoNeto de un Pago confirmado via PATCH', async () => {
    pagoModel.findByIdAndUpdate.mockResolvedValue({ _id: 'pago1', estado: 'confirmado', montoNeto: 95000 });

    await service.update('pago1', { montoBase: 5000000, montoNeto: 9999999 } as any);

    const [, persisted] = pagoModel.findByIdAndUpdate.mock.calls[0];
    expect(persisted).not.toHaveProperty('montoBase');
    expect(persisted).not.toHaveProperty('montoNeto');
  });

  it('elimina retenciones, comision, estado y ownership del update; deja pasar campos descriptivos', async () => {
    pagoModel.findByIdAndUpdate.mockResolvedValue({ _id: 'pago1', estado: 'confirmado' });

    await service.update('pago1', {
      montoBase: 1,
      montoNeto: 1,
      retencionIIBB: 1,
      retencionGanancias: 1,
      retencionIVA: 1,
      retencionSUSS: 1,
      otrasRetenciones: 1,
      comision: 1,
      descuento: 1,
      estado: 'anulado',
      factura: 'otra-factura',
      ordenPago: 'otra-orden',
      convenioAplicado: 'otro-convenio',
      referenciaPago: 'REF-OK',
      observaciones: 'nota segura',
    } as any);

    const [, persisted] = pagoModel.findByIdAndUpdate.mock.calls[0];
    for (const campo of [
      'montoBase', 'montoNeto', 'retencionIIBB', 'retencionGanancias', 'retencionIVA',
      'retencionSUSS', 'otrasRetenciones', 'comision', 'descuento', 'estado',
      'factura', 'ordenPago', 'convenioAplicado',
    ]) {
      expect(persisted).not.toHaveProperty(campo);
    }
    expect(persisted).toHaveProperty('referenciaPago', 'REF-OK');
    expect(persisted).toHaveProperty('observaciones', 'nota segura');
  });

  it('lanza NotFound si el pago no existe', async () => {
    pagoModel.findByIdAndUpdate.mockResolvedValue(null);
    await expect(service.update('x', { observaciones: 'x' } as any)).rejects.toBeInstanceOf(NotFoundException);
  });
});
