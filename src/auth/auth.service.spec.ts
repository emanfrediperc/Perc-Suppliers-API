import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { AuthService } from './auth.service';
import { User } from './schemas/user.schema';
import { cifrar } from '../common/utils/cifrado.util';
import * as bcrypt from 'bcrypt';

jest.mock('otplib');
jest.mock('qrcode');

/** Clave AES-256-GCM de test (64 hex = 32 bytes). */
const TEST_ENC_KEY = 'a'.repeat(64);

describe('AuthService', () => {
  let service: AuthService;
  let userModel: any;
  let jwtService: any;
  let configService: any;

  const mockUser: any = {
    _id: '507f1f77bcf86cd799439011',
    email: 'test@perc.com',
    password: '',
    nombre: 'Test',
    apellido: 'User',
    role: 'admin',
    activo: true,
    tokenVersion: 0,
    failedLoginAttempts: 0,
    lockUntil: null,
    mustChangePassword: false,
    save: jest.fn(),
  };

  beforeEach(async () => {
    mockUser.password = await bcrypt.hash('correctPassword', 10);
    mockUser.failedLoginAttempts = 0;
    mockUser.lockUntil = null;
    mockUser.tokenVersion = 0;
    mockUser.mustChangePassword = false;
    mockUser.activo = true;
    mockUser.totpHabilitado = false;
    mockUser.totpSecretCifrado = null;
    mockUser.totpSecretProvisional = null;
    mockUser.codigosRecuperacion = [];
    mockUser.stepUpIntentosFallidos = 0;
    mockUser.stepUpBloqueadoHasta = null;
    mockUser.save = jest.fn().mockResolvedValue(mockUser);

    const mockUserModel = {
      findOne: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };

    const mockJwtService = {
      sign: jest.fn().mockReturnValue('mock-jwt-token'),
      verify: jest
        .fn()
        .mockReturnValue({ sub: mockUser._id, scope: 'pre-2fa' }),
    };

    const mockConfigService = {
      get: jest.fn().mockReturnValue(''),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userModel = module.get(getModelToken(User.name));
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);

    // Defaults de los mocks de otplib/qrcode
    (authenticator.generateSecret as jest.Mock).mockReturnValue('SECRETBASE32');
    (authenticator.keyuri as jest.Mock).mockReturnValue('otpauth://totp/x');
    (authenticator.verify as jest.Mock).mockReturnValue(true);
    (QRCode.toDataURL as jest.Mock).mockResolvedValue(
      'data:image/png;base64,xx',
    );
  });

  // ─── Login lockout ────────────────────────────────────────────────────────

  describe('login lockout', () => {
    it('locks account after 5 failed login attempts', async () => {
      mockUser.failedLoginAttempts = 4;
      userModel.findOne.mockResolvedValue(mockUser);

      await expect(
        service.login({ email: 'test@perc.com', password: 'wrongPassword' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockUser.lockUntil).not.toBeNull();
      expect(mockUser.failedLoginAttempts).toBe(0);
    });

    it('rejects login on locked account even with correct password', async () => {
      mockUser.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
      userModel.findOne.mockResolvedValue(mockUser);

      await expect(
        service.login({ email: 'test@perc.com', password: 'correctPassword' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException with "bloqueada" message when account is locked', async () => {
      mockUser.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
      userModel.findOne.mockResolvedValue(mockUser);

      await expect(
        service.login({ email: 'test@perc.com', password: 'correctPassword' }),
      ).rejects.toThrow(/bloqueada/);
    });

    it('increments failedLoginAttempts on wrong password', async () => {
      mockUser.failedLoginAttempts = 0;
      userModel.findOne.mockResolvedValue(mockUser);

      await expect(
        service.login({ email: 'test@perc.com', password: 'wrongPassword' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockUser.failedLoginAttempts).toBe(1);
    });

    it('resets failedLoginAttempts and lockUntil on successful login', async () => {
      mockUser.failedLoginAttempts = 3;
      mockUser.lockUntil = null;
      userModel.findOne.mockResolvedValue(mockUser);

      await service.login({
        email: 'test@perc.com',
        password: 'correctPassword',
      });

      expect(mockUser.failedLoginAttempts).toBe(0);
      expect(mockUser.lockUntil).toBeNull();
    });
  });

  // ─── Token revocation ─────────────────────────────────────────────────────

  describe('token revocation', () => {
    it('resetPassword() bumps tokenVersion by 1', async () => {
      mockUser.tokenVersion = 2;
      userModel.findById.mockResolvedValue(mockUser);

      await service.resetPassword(mockUser._id);

      expect(mockUser.tokenVersion).toBe(3);
    });

    it('resetPassword() sets mustChangePassword to true', async () => {
      userModel.findById.mockResolvedValue(mockUser);

      await service.resetPassword(mockUser._id);

      expect(mockUser.mustChangePassword).toBe(true);
    });

    it('generateAuthResponse() includes tokenVersion in JWT payload', async () => {
      mockUser.tokenVersion = 5;
      userModel.findOne.mockResolvedValue(mockUser);

      await service.login({
        email: 'test@perc.com',
        password: 'correctPassword',
      });

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ tokenVersion: 5 }),
      );
    });
  });

  // ─── Password generation ──────────────────────────────────────────────────

  describe('password generation', () => {
    it('resetPassword() generates a non-empty password', async () => {
      userModel.findById.mockResolvedValue(mockUser);

      const result = await service.resetPassword(mockUser._id);

      expect(result.temporaryPassword).toBeTruthy();
      expect(result.temporaryPassword.length).toBeGreaterThan(0);
    });

    it('resetPassword() does not use Math.random — uses crypto.randomBytes', async () => {
      // Verify the import at the module level references crypto, not Math.random
      const authServiceSource = require('fs').readFileSync(
        require('path').resolve(__dirname, 'auth.service.ts'),
        'utf8',
      );
      expect(authServiceSource).toContain("from 'crypto'");
      expect(authServiceSource).not.toContain('Math.random');
    });
  });

  // ─── Change password ──────────────────────────────────────────────────────

  describe('changePassword', () => {
    it('succeeds with correct old password and returns a new token', async () => {
      userModel.findById.mockResolvedValue(mockUser);

      const result = await service.changePassword(
        mockUser._id,
        'correctPassword',
        'newPassword123',
      );

      expect(result.access_token).toBe('mock-jwt-token');
    });

    it('throws UnauthorizedException with wrong old password', async () => {
      userModel.findById.mockResolvedValue(mockUser);

      await expect(
        service.changePassword(mockUser._id, 'wrongPassword', 'newPassword123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('sets mustChangePassword to false on success', async () => {
      mockUser.mustChangePassword = true;
      userModel.findById.mockResolvedValue(mockUser);

      await service.changePassword(
        mockUser._id,
        'correctPassword',
        'newPassword123',
      );

      expect(mockUser.mustChangePassword).toBe(false);
    });

    it('bumps tokenVersion on successful password change', async () => {
      mockUser.tokenVersion = 1;
      userModel.findById.mockResolvedValue(mockUser);

      await service.changePassword(
        mockUser._id,
        'correctPassword',
        'newPassword123',
      );

      expect(mockUser.tokenVersion).toBe(2);
    });
  });

  // ─── Register ─────────────────────────────────────────────────────────────

  describe('register', () => {
    const registerDto = {
      email: 'new@perc.com',
      password: 'password123',
      nombre: 'New',
      apellido: 'User',
      role: 'consulta' as const,
    };

    it('creates user with tokenVersion 0 and mustChangePassword false', async () => {
      userModel.findOne.mockResolvedValue(null);
      userModel.create.mockResolvedValue({
        ...mockUser,
        ...registerDto,
        tokenVersion: 0,
        mustChangePassword: false,
      });

      const result = await service.register(registerDto);

      expect(userModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ tokenVersion: 0, mustChangePassword: false }),
      );
      expect(result.access_token).toBe('mock-jwt-token');
    });

    it('throws ConflictException on duplicate email', async () => {
      userModel.findOne.mockResolvedValue(mockUser);

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ─── Login 2FA (TOTP) ──────────────────────────────────────────────────────

  describe('login 2FA', () => {
    const enable2fa = () =>
      configService.get.mockImplementation((k: string) =>
        k === 'login2fa.enabled'
          ? true
          : k === 'totp.encKey'
            ? TEST_ENC_KEY
            : '',
      );

    it('usuario SIN TOTP recibe challenge de enrolamiento (no access_token)', async () => {
      enable2fa();
      mockUser.totpHabilitado = false;
      userModel.findOne.mockResolvedValue(mockUser);
      userModel.findById.mockResolvedValue(mockUser);

      const res: any = await service.login({
        email: 'test@perc.com',
        password: 'correctPassword',
      });

      expect(res.requiere2fa).toBe(true);
      expect(res.requiereEnrolarTotp).toBe(true);
      expect(res.challengeToken).toBe('mock-jwt-token');
      expect(res.enrolamiento?.qrDataUrl).toBeTruthy();
      expect(res.access_token).toBeUndefined();
    });

    it('usuario CON TOTP recibe challenge de verificación', async () => {
      enable2fa();
      mockUser.totpHabilitado = true;
      mockUser.totpSecretCifrado = cifrar('SECRETBASE32', TEST_ENC_KEY);
      userModel.findOne.mockResolvedValue(mockUser);

      const res: any = await service.login({
        email: 'test@perc.com',
        password: 'correctPassword',
      });

      expect(res.requiere2fa).toBe(true);
      expect(res.requiereEnrolarTotp).toBe(false);
      expect(res.access_token).toBeUndefined();
    });

    it('loginVerificarTotp con código válido devuelve access_token', async () => {
      enable2fa();
      mockUser.totpHabilitado = true;
      mockUser.totpSecretCifrado = cifrar('SECRETBASE32', TEST_ENC_KEY);
      userModel.findById.mockResolvedValue(mockUser);
      (authenticator.verify as jest.Mock).mockReturnValue(true);

      const res = await service.loginVerificarTotp('challenge', '123456');
      expect(res.access_token).toBe('mock-jwt-token');
    });

    it('loginVerificarTotp con código inválido y sin recovery lanza 401', async () => {
      enable2fa();
      mockUser.totpHabilitado = true;
      mockUser.totpSecretCifrado = cifrar('SECRETBASE32', TEST_ENC_KEY);
      mockUser.codigosRecuperacion = [];
      userModel.findById.mockResolvedValue(mockUser);
      (authenticator.verify as jest.Mock).mockReturnValue(false);

      await expect(
        service.loginVerificarTotp('challenge', '000000'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('loginVerificarTotp acepta un código de recuperación (single-use)', async () => {
      enable2fa();
      mockUser.totpHabilitado = true;
      mockUser.totpSecretCifrado = cifrar('SECRETBASE32', TEST_ENC_KEY);
      const recovery = 'abc123';
      mockUser.codigosRecuperacion = [await bcrypt.hash(recovery, 10)];
      userModel.findById.mockResolvedValue(mockUser);
      (authenticator.verify as jest.Mock).mockReturnValue(false);

      const res = await service.loginVerificarTotp('challenge', recovery);
      expect(res.access_token).toBe('mock-jwt-token');
      // Consumo atómico vía $pull (single-use), no mutación en memoria.
      expect(userModel.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({ _id: mockUser._id }),
        expect.objectContaining({ $pull: expect.anything() }),
      );
    });

    it('loginEnrolarTotp habilita TOTP y devuelve access_token + recovery codes', async () => {
      enable2fa();
      mockUser.totpHabilitado = false;
      // confirmarTotp valida contra el secreto PROVISIONAL (no el activo).
      mockUser.totpSecretProvisional = cifrar('SECRETBASE32', TEST_ENC_KEY);
      userModel.findById.mockResolvedValue(mockUser);
      (authenticator.verify as jest.Mock).mockReturnValue(true);

      const res = await service.loginEnrolarTotp('challenge', '123456');
      expect(res.access_token).toBe('mock-jwt-token');
      expect(res.codigosRecuperacion.length).toBeGreaterThan(0);
      expect(mockUser.totpHabilitado).toBe(true);
    });

    it('challenge inválido (verify lanza) → 401', async () => {
      enable2fa();
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });
      await expect(
        service.loginVerificarTotp('expirado', '123456'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('SEGURIDAD: enrolarTotp NO destruye un 2FA ya activo (rechaza re-enrolamiento)', async () => {
      enable2fa();
      mockUser.totpHabilitado = true;
      mockUser.totpSecretCifrado = cifrar('SECRETO-ACTIVO', TEST_ENC_KEY);
      userModel.findById.mockResolvedValue(mockUser);

      await expect(service.enrolarTotp(mockUser._id)).rejects.toThrow(
        BadRequestException,
      );
      // El secreto activo y el flag siguen intactos (no hubo downgrade).
      expect(mockUser.totpHabilitado).toBe(true);
      expect(mockUser.totpSecretCifrado).toBeTruthy();
    });

    it('challenge con tokenVersion distinta (password reseteada) → 401', async () => {
      enable2fa();
      mockUser.totpHabilitado = true;
      mockUser.totpSecretCifrado = cifrar('SECRETBASE32', TEST_ENC_KEY);
      mockUser.tokenVersion = 5; // el usuario avanzó de versión tras el challenge
      jwtService.verify.mockReturnValue({
        sub: mockUser._id,
        scope: 'pre-2fa',
        tokenVersion: 2,
      });
      userModel.findById.mockResolvedValue(mockUser);

      await expect(
        service.loginVerificarTotp('viejo', '123456'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
