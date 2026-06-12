import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import { StepUpService } from './step-up.service';

jest.mock('bcrypt');
jest.mock('otplib');
// descifrar es irrelevante para el anti-replay: stubeamos para que devuelva el
// secreto crudo sin tocar AES.
jest.mock('../../common/utils/cifrado.util', () => ({
  descifrar: (v: string) => v,
  cifrar: (v: string) => v,
}));
const compareMock = bcrypt.compare as unknown as jest.Mock;
const checkDeltaMock = authenticator.checkDelta as unknown as jest.Mock;
const allOptionsMock = authenticator.allOptions as unknown as jest.Mock;

/**
 * Tests de la lógica crítica de seguridad del step-up: verificación de factor,
 * lockout, y proof single-use / scoped. Se instancia el servicio con mocks directos.
 */
describe('StepUpService', () => {
  const tokenDoc = {
    aprobacionId: { toString: () => 'apr1' },
    userId: 'u1',
    userEmail: 'a@p.com',
  };

  function makeDesafio(over: Record<string, any> = {}) {
    return {
      _id: { toString: () => 'd1' },
      aprobacionId: { toString: () => 'apr1' },
      userId: 'u1',
      userEmail: 'a@p.com',
      factorRequerido: 'password',
      satisfecho: false,
      factorUsado: null,
      intentosFallidos: 0,
      bloqueadoHasta: null,
      proofHash: null,
      proofUsado: false,
      expiresAt: new Date(Date.now() + 600_000),
      save: jest.fn().mockResolvedValue(undefined),
      ...over,
    };
  }

  function makeUser(over: Record<string, any> = {}) {
    return {
      _id: 'u1',
      email: 'a@p.com',
      password: 'hash',
      totpHabilitado: false,
      totpSecretCifrado: null,
      stepUpIntentosFallidos: 0,
      stepUpBloqueadoHasta: null,
      save: jest.fn().mockResolvedValue(undefined),
      ...over,
    };
  }

  function build(over: { desafio?: any; user?: any } = {}) {
    const desafioModel: any = {
      create: jest.fn().mockResolvedValue(makeDesafio()),
      findById: jest.fn().mockResolvedValue(over.desafio ?? makeDesafio()),
      findOneAndUpdate: jest.fn().mockResolvedValue(over.desafio ?? null),
    };
    const userModel: any = {
      findById: jest.fn().mockResolvedValue(over.user ?? makeUser()),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    const tokenService: any = { verify: jest.fn().mockResolvedValue(tokenDoc) };
    const auditLog: any = { log: jest.fn().mockResolvedValue(undefined) };
    const config: any = { get: jest.fn().mockReturnValue('') };
    const svc = new StepUpService(
      desafioModel,
      userModel,
      tokenService,
      auditLog,
      config,
    );
    return { svc, desafioModel, userModel, tokenService, auditLog };
  }

  it('iniciarDesafio crea un desafío y devuelve su id', async () => {
    const { svc } = build();
    const r = await svc.iniciarDesafio('raw', 'password', '1.2.3.4', 'jest');
    expect(r.desafioId).toBe('d1');
    expect(r.factorRequerido).toBe('password');
  });

  it('verificarDesafio con password correcta emite un proof', async () => {
    const desafio = makeDesafio();
    const { svc } = build({ desafio });
    compareMock.mockResolvedValue(true);

    const r = await svc.verificarDesafio(
      'raw',
      'd1',
      'pass-ok',
      '1.2.3.4',
      'jest',
    );
    expect(typeof r.stepUpProof).toBe('string');
    expect(desafio.satisfecho).toBe(true);
    expect(desafio.proofHash).toBeTruthy();
  });

  it('verificarDesafio con password incorrecta falla e incrementa intentos', async () => {
    const desafio = makeDesafio();
    const { svc } = build({ desafio });
    compareMock.mockResolvedValue(false);

    await expect(
      svc.verificarDesafio('raw', 'd1', 'mala', '1.2.3.4', 'jest'),
    ).rejects.toThrow(UnauthorizedException);
    expect(desafio.intentosFallidos).toBe(1);
    expect(desafio.satisfecho).toBe(false);
  });

  it('bloquea el desafío tras 5 intentos fallidos', async () => {
    const desafio = makeDesafio({ intentosFallidos: 4 });
    const { svc } = build({ desafio });
    compareMock.mockResolvedValue(false);

    await expect(
      svc.verificarDesafio('raw', 'd1', 'mala', '1.2.3.4', 'jest'),
    ).rejects.toThrow(UnauthorizedException);
    expect(desafio.intentosFallidos).toBe(5);
    expect(desafio.bloqueadoHasta).toBeInstanceOf(Date);
  });

  it('rechaza verificar si el desafío ya está bloqueado', async () => {
    const desafio = makeDesafio({
      bloqueadoHasta: new Date(Date.now() + 60_000),
    });
    const { svc } = build({ desafio });
    await expect(
      svc.verificarDesafio('raw', 'd1', 'x', '1.2.3.4', 'jest'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('SEGURIDAD: rechaza verificar si el USUARIO está bloqueado (lockout no se evade recreando desafíos)', async () => {
    const desafio = makeDesafio(); // desafío nuevo, sin bloqueo propio
    const user = makeUser({
      stepUpBloqueadoHasta: new Date(Date.now() + 60_000),
    });
    const { svc } = build({ desafio, user });
    await expect(
      svc.verificarDesafio('raw', 'd1', 'x', '1.2.3.4', 'jest'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('validarYConsumirProof acepta el proof una sola vez y luego lo rechaza', async () => {
    const rawProof = 'proof-secreto';
    const proofHash = createHash('sha256').update(rawProof).digest('hex');
    const desafio = makeDesafio({
      satisfecho: true,
      factorUsado: 'password',
      proofHash,
    });
    const { svc, desafioModel } = build();
    // Consumo atómico: 1ra vez matchea (devuelve doc), 2da vez ya usado → null.
    desafioModel.findOneAndUpdate = jest
      .fn()
      .mockResolvedValueOnce(desafio)
      .mockResolvedValueOnce(null);

    const r = await svc.validarYConsumirProof('apr1', 'u1', 'd1', rawProof);
    expect(r.factorUsado).toBe('password');

    await expect(
      svc.validarYConsumirProof('apr1', 'u1', 'd1', rawProof),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('validarYConsumirProof rechaza un proof fuera de scope (otra aprobación)', async () => {
    const { svc, desafioModel } = build();
    // El query atómico con aprobacionId distinto no matchea → null.
    desafioModel.findOneAndUpdate = jest.fn().mockResolvedValue(null);

    await expect(
      svc.validarYConsumirProof('OTRA-apr', 'u1', 'd1', 'proof'),
    ).rejects.toThrow(UnauthorizedException);
  });

  // ─── REGRESIÓN #3: replay de un código TOTP en step-up ─────────────────────

  it('SEGURIDAD: step-up TOTP rechaza el replay de un código ya consumido', async () => {
    const stepActual = Math.floor(Date.now() / 1000 / 30);
    const desafio = makeDesafio({ factorRequerido: 'totp' });
    const user = makeUser({
      totpHabilitado: true,
      totpSecretCifrado: 'SECRET',
      ultimoTotpStep: stepActual, // ese step ya se usó
    });
    const { svc } = build({ desafio, user });
    checkDeltaMock.mockReturnValue(0);
    allOptionsMock.mockReturnValue({ step: 30 });

    await expect(
      svc.verificarDesafio('raw', 'd1', '123456', '1.2.3.4', 'jest'),
    ).rejects.toThrow(UnauthorizedException);
    expect(desafio.satisfecho).toBe(false); // replay no emite proof
  });

  it('step-up TOTP acepta un código fresco y emite proof (consume el step)', async () => {
    const desafio = makeDesafio({ factorRequerido: 'totp' });
    const user = makeUser({
      totpHabilitado: true,
      totpSecretCifrado: 'SECRET',
      ultimoTotpStep: 0,
    });
    const { svc, userModel } = build({ desafio, user });
    checkDeltaMock.mockReturnValue(0);
    allOptionsMock.mockReturnValue({ step: 30 });

    const r = await svc.verificarDesafio('raw', 'd1', '123456', '1.2.3.4', 'j');
    expect(typeof r.stepUpProof).toBe('string');
    expect(desafio.satisfecho).toBe(true);
    expect(userModel.updateOne).toHaveBeenCalled(); // persistió el step consumido
  });

  // ─── REGRESIÓN #2 (parte step-up): twins JWT scoped a (aprobacionId, userId) ─

  it('iniciarDesafioJwt crea un desafío scoped al userId del JWT (sin magic-link)', async () => {
    const { svc, desafioModel, tokenService } = build();
    const r = await svc.iniciarDesafioJwt(
      'apr1',
      'u1',
      'a@p.com',
      'password',
      '1.2.3.4',
      'jest',
    );
    expect(r.desafioId).toBe('d1');
    // NO se usa el magic-link token en el path JWT.
    expect(tokenService.verify).not.toHaveBeenCalled();
    expect(desafioModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ aprobacionId: 'apr1', userId: 'u1' }),
    );
  });

  it('verificarDesafioJwt valida el factor con identidad del JWT', async () => {
    const desafio = makeDesafio();
    const { svc } = build({ desafio });
    compareMock.mockResolvedValue(true);
    const r = await svc.verificarDesafioJwt(
      'apr1',
      'u1',
      'd1',
      'pass-ok',
      '1.2.3.4',
      'jest',
    );
    expect(typeof r.stepUpProof).toBe('string');
    expect(desafio.satisfecho).toBe(true);
  });
});
