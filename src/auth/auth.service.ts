import { randomBytes } from 'crypto';
import { Injectable, UnauthorizedException, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from './schemas/user.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthResponseDto } from './dto/auth-response.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    const existing = await this.userModel.findOne({ email: registerDto.email });
    if (existing) {
      throw new ConflictException('El email ya esta registrado');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);
    const user = await this.userModel.create({
      ...registerDto,
      password: hashedPassword,
      tokenVersion: 0,
      failedLoginAttempts: 0,
      lockUntil: null,
      mustChangePassword: false,
    });

    return this.generateAuthResponse(user);
  }

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.userModel.findOne({ email: loginDto.email });
    if (!user) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    if (!user.activo) {
      throw new UnauthorizedException('Usuario desactivado');
    }

    const now = new Date();
    if (user.lockUntil && user.lockUntil > now) {
      const minutesLeft = Math.ceil((user.lockUntil.getTime() - now.getTime()) / 60000);
      throw new UnauthorizedException(
        `Cuenta bloqueada por intentos fallidos. Intentá de nuevo en ${minutesLeft} minutos.`,
      );
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordValid) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= 5) {
        user.lockUntil = new Date(now.getTime() + 15 * 60 * 1000);
        user.failedLoginAttempts = 0;
      }
      await user.save();
      throw new UnauthorizedException('Credenciales invalidas');
    }

    if (user.failedLoginAttempts > 0 || user.lockUntil) {
      user.failedLoginAttempts = 0;
      user.lockUntil = null;
      await user.save();
    }

    return this.generateAuthResponse(user);
  }

  async getProfile(userId: string) {
    const user = await this.userModel.findById(userId).select('-password');
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }
    return user;
  }

  async findAllUsers() {
    return this.userModel.find().select('-password').sort({ createdAt: -1 });
  }

  async updateUser(userId: string, dto: UpdateUserDto) {
    const user = await this.userModel.findByIdAndUpdate(userId, dto, { new: true }).select('-password');
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async resetPassword(userId: string): Promise<{ temporaryPassword: string }> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Usuario no encontrado');
    const temporaryPassword = randomBytes(9).toString('base64url');
    user.password = await bcrypt.hash(temporaryPassword, 10);
    user.mustChangePassword = true;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    return { temporaryPassword };
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Usuario no encontrado');
    const valid = await bcrypt.compare(oldPassword, user.password);
    if (!valid) throw new UnauthorizedException('Contraseña actual incorrecta');
    user.password = await bcrypt.hash(newPassword, 10);
    user.mustChangePassword = false;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    return this.generateAuthResponse(user);
  }

  private generateAuthResponse(user: UserDocument): AuthResponseDto {
    const payload = { sub: user._id, email: user.email, role: user.role, tokenVersion: user.tokenVersion ?? 0 };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user._id.toString(),
        email: user.email,
        nombre: user.nombre,
        apellido: user.apellido,
        role: user.role,
        mustChangePassword: user.mustChangePassword ?? false,
      },
    };
  }
}
