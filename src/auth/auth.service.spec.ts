import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { User } from './schemas/user.schema';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let userModel: any;
  let jwtService: any;

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
    mockUser.save = jest.fn().mockResolvedValue(mockUser);

    const mockUserModel = {
      findOne: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
    };

    const mockJwtService = {
      sign: jest.fn().mockReturnValue('mock-jwt-token'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userModel = module.get(getModelToken(User.name));
    jwtService = module.get(JwtService);
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

      await service.login({ email: 'test@perc.com', password: 'correctPassword' });

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

      await service.login({ email: 'test@perc.com', password: 'correctPassword' });

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

      await service.changePassword(mockUser._id, 'correctPassword', 'newPassword123');

      expect(mockUser.mustChangePassword).toBe(false);
    });

    it('bumps tokenVersion on successful password change', async () => {
      mockUser.tokenVersion = 1;
      userModel.findById.mockResolvedValue(mockUser);

      await service.changePassword(mockUser._id, 'correctPassword', 'newPassword123');

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

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
    });
  });
});
