import { UnauthorizedException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { User } from '../schemas/user.schema';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let userModel: any;

  const activeUser = {
    _id: '507f1f77bcf86cd799439011',
    email: 'test@perc.com',
    role: 'admin',
    activo: true,
    tokenVersion: 3,
    mustChangePassword: false,
  };

  beforeEach(async () => {
    const mockUserModel = {
      findById: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn().mockReturnValue('test-secret'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
    userModel = module.get(getModelToken(User.name));
  });

  // ─── validate() ───────────────────────────────────────────────────────────

  describe('validate()', () => {
    it('returns user info when payload matches tokenVersion and user is active', async () => {
      userModel.findById.mockResolvedValue(activeUser);

      const result = await strategy.validate({
        sub: activeUser._id,
        email: activeUser.email,
        role: activeUser.role,
        tokenVersion: 3,
      });

      expect(result).toEqual({
        userId: activeUser._id,
        email: activeUser.email,
        role: activeUser.role,
        mustChangePassword: false,
      });
    });

    // ─── REGRESIÓN #1: el role sale de la DB, no se congela en el token ────────

    it('SEGURIDAD: devuelve el role FRESCO de la DB, ignorando el role del token', async () => {
      // El token viejo trae role:'admin' pero el admin ya degradó al usuario a 'consulta'
      // en la DB. validate() debe devolver 'consulta', NO 'admin'.
      userModel.findById.mockResolvedValue({ ...activeUser, role: 'consulta' });

      const result = await strategy.validate({
        sub: activeUser._id,
        email: activeUser.email,
        role: 'admin', // role obsoleto en el token
        tokenVersion: 3,
      });

      expect((result as any).role).toBe('consulta');
    });

    // ─── REGRESIÓN #6: mustChangePassword viaja al guard server-side ───────────

    it('SEGURIDAD: propaga mustChangePassword=true para que el guard lo enforce', async () => {
      userModel.findById.mockResolvedValue({
        ...activeUser,
        mustChangePassword: true,
      });

      const result = await strategy.validate({
        sub: activeUser._id,
        email: activeUser.email,
        role: activeUser.role,
        tokenVersion: 3,
      });

      expect((result as any).mustChangePassword).toBe(true);
    });

    it('throws UnauthorizedException when user does not exist', async () => {
      userModel.findById.mockResolvedValue(null);

      await expect(
        strategy.validate({
          sub: 'nonexistent-id',
          email: 'ghost@perc.com',
          role: 'admin',
          tokenVersion: 0,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when user is inactive', async () => {
      userModel.findById.mockResolvedValue({ ...activeUser, activo: false });

      await expect(
        strategy.validate({
          sub: activeUser._id,
          email: activeUser.email,
          role: activeUser.role,
          tokenVersion: 3,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when tokenVersion in payload does not match user', async () => {
      userModel.findById.mockResolvedValue(activeUser); // tokenVersion is 3

      await expect(
        strategy.validate({
          sub: activeUser._id,
          email: activeUser.email,
          role: activeUser.role,
          tokenVersion: 1, // stale token
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
