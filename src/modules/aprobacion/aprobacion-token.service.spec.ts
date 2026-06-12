import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { AprobacionTokenService } from './aprobacion-token.service';
import { AprobacionToken } from './schemas/aprobacion-token.schema';

describe('AprobacionTokenService — consumeAtomic (single-use atómico #8)', () => {
  let service: AprobacionTokenService;
  let tokenModel: any;

  const tokenDoc: any = {
    _id: new Types.ObjectId(),
    aprobacionId: new Types.ObjectId(),
    userId: new Types.ObjectId(),
  };

  beforeEach(async () => {
    tokenModel = {
      updateOne: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ matchedCount: 0 }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AprobacionTokenService,
        { provide: getModelToken(AprobacionToken.name), useValue: tokenModel },
        { provide: ConfigService, useValue: { get: () => 48 } },
      ],
    }).compile();
    service = module.get(AprobacionTokenService);
  });

  it('primer consumo: gate condicional {usado:false}, devuelve true e invalida tokens hermanos pendientes', async () => {
    tokenModel.updateOne.mockResolvedValue({ matchedCount: 1 });

    const ok = await service.consumeAtomic(tokenDoc, '1.2.3.4', 'UA');

    expect(ok).toBe(true);
    // El consumo es condicional sobre usado:false (single-use atómico)
    expect(tokenModel.updateOne).toHaveBeenCalledWith(
      { _id: tokenDoc._id, usado: false },
      expect.objectContaining({
        $set: expect.objectContaining({
          usado: true,
          ip: '1.2.3.4',
          userAgent: 'UA',
        }),
      }),
    );
    // Invalida los tokens hermanos del mismo (aprobacionId, userId) que sigan pendientes
    expect(tokenModel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        aprobacionId: tokenDoc.aprobacionId,
        userId: tokenDoc.userId,
        _id: { $ne: tokenDoc._id },
        usado: false,
      }),
      expect.objectContaining({ $set: expect.objectContaining({ usado: true }) }),
    );
  });

  it('replay (segundo request concurrente perdió la carrera): matchedCount 0 → devuelve false y NO invalida hermanos', async () => {
    tokenModel.updateOne.mockResolvedValue({ matchedCount: 0 });

    const ok = await service.consumeAtomic(tokenDoc, '1.2.3.4', 'UA');

    expect(ok).toBe(false);
    expect(tokenModel.updateMany).not.toHaveBeenCalled();
  });
});
