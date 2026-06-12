/**
 * Unit tests para PagoProgramadoAprobacionListener.
 * Regresion seguridad: el cron solo ejecuta items en 'programado', y ese estado
 * SOLO se alcanza tras una aprobacion. Un pago programado en 'esperando_aprobacion'
 * jamas se vuelve ejecutable sin pasar por el gate.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';

import { PagoProgramadoAprobacionListener } from './pago-programado-aprobacion.listener';
import { PagoProgramado } from './schemas/pago-programado.schema';

describe('PagoProgramadoAprobacionListener', () => {
  let listener: PagoProgramadoAprobacionListener;
  let model: { findById: jest.Mock };

  beforeEach(async () => {
    model = { findById: jest.fn() };
    const ref: TestingModule = await Test.createTestingModule({
      providers: [
        PagoProgramadoAprobacionListener,
        { provide: getModelToken(PagoProgramado.name), useValue: model },
      ],
    }).compile();
    listener = ref.get(PagoProgramadoAprobacionListener);
  });

  it('ignora eventos de otras entidades', async () => {
    await listener.handle({ entidad: 'ordenes-pago', entidadId: 'x', estado: 'aprobada' } as any);
    expect(model.findById).not.toHaveBeenCalled();
  });

  it('transiciona esperando_aprobacion -> programado al aprobar', async () => {
    const pp: any = { estado: 'esperando_aprobacion', save: jest.fn().mockResolvedValue(undefined) };
    model.findById.mockResolvedValue(pp);
    await listener.handle({ entidad: 'pagos-programados', entidadId: 'pp1', estado: 'aprobada' } as any);
    expect(pp.estado).toBe('programado');
    expect(pp.save).toHaveBeenCalled();
  });

  it('transiciona esperando_aprobacion -> rechazado al rechazar', async () => {
    const pp: any = { estado: 'esperando_aprobacion', save: jest.fn().mockResolvedValue(undefined) };
    model.findById.mockResolvedValue(pp);
    await listener.handle({ entidad: 'pagos-programados', entidadId: 'pp1', estado: 'rechazada' } as any);
    expect(pp.estado).toBe('rechazado');
  });

  it('es idempotente: no re-transiciona uno que ya salio de esperando_aprobacion', async () => {
    const pp: any = { estado: 'programado', save: jest.fn().mockResolvedValue(undefined) };
    model.findById.mockResolvedValue(pp);
    await listener.handle({ entidad: 'pagos-programados', entidadId: 'pp1', estado: 'aprobada' } as any);
    expect(pp.save).not.toHaveBeenCalled();
    expect(pp.estado).toBe('programado');
  });

  it('reenvio: rechazado -> esperando_aprobacion', async () => {
    const pp: any = { estado: 'rechazado', save: jest.fn().mockResolvedValue(undefined) };
    model.findById.mockResolvedValue(pp);
    await listener.handleReenviada({ entidad: 'pagos-programados', entidadId: 'pp1' } as any);
    expect(pp.estado).toBe('esperando_aprobacion');
  });
});
