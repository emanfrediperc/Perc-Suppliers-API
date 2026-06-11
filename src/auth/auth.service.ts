import { randomBytes } from 'crypto';
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { User, UserDocument } from './schemas/user.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { cifrar, descifrar } from '../common/utils/cifrado.util';

/** Respuesta del login cuando 2FA está activo: aún no hay access token. */
export interface LoginChallenge {
  requiere2fa: true;
  /** El usuario no tiene TOTP enrolado → debe configurarlo con el QR adjunto. */
  requiereEnrolarTotp: boolean;
  /** Token de pre-auth (corta vida) que liga el paso 2 al usuario validado. */
  challengeToken: string;
  /** Datos de enrolamiento (sólo si requiereEnrolarTotp). */
  enrolamiento?: { otpauthUrl: string; qrDataUrl: string };
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
    private readonly config: ConfigService,
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

  async login(loginDto: LoginDto): Promise<AuthResponseDto | LoginChallenge> {
    const user = await this.userModel.findOne({ email: loginDto.email });
    if (!user) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    if (!user.activo) {
      throw new UnauthorizedException('Usuario desactivado');
    }

    const now = new Date();
    if (user.lockUntil && user.lockUntil > now) {
      const minutesLeft = Math.ceil(
        (user.lockUntil.getTime() - now.getTime()) / 60000,
      );
      throw new UnauthorizedException(
        `Cuenta bloqueada por intentos fallidos. Intentá de nuevo en ${minutesLeft} minutos.`,
      );
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );
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

    // 2FA de login (feature-flagged). Si está off, login normal (comportamiento actual).
    if (!this.config.get<boolean>('login2fa.enabled')) {
      return this.generateAuthResponse(user);
    }

    // Password OK → emitir challenge de pre-auth (NO el access token todavía).
    // Lleva tokenVersion para invalidarse si la contraseña se resetea/cambia en la ventana.
    const userId = (user._id as any).toString();
    const challengeToken = this.jwtService.sign(
      { sub: userId, scope: 'pre-2fa', tokenVersion: user.tokenVersion ?? 0 },
      { expiresIn: '5m' },
    );

    if (!user.totpHabilitado) {
      // Enrolamiento forzado: generar secreto provisional + QR para escanear.
      const enrolamiento = await this.enrolarTotp(userId);
      return {
        requiere2fa: true,
        requiereEnrolarTotp: true,
        challengeToken,
        enrolamiento,
      };
    }

    return {
      requiere2fa: true,
      requiereEnrolarTotp: false,
      challengeToken,
    };
  }

  /**
   * Paso 2 (login normal con TOTP ya enrolado): valida el código TOTP — o un
   * código de recuperación — contra el challenge y devuelve el access token.
   */
  async loginVerificarTotp(
    challengeToken: string,
    codigo: string,
  ): Promise<AuthResponseDto> {
    const { sub: userId, tokenVersion } =
      this.verificarChallenge(challengeToken);
    const user = await this.userModel.findById(userId);
    if (!user || !user.activo || (user.tokenVersion ?? 0) !== tokenVersion) {
      throw new UnauthorizedException();
    }
    if (!user.totpHabilitado || !user.totpSecretCifrado) {
      throw new UnauthorizedException('TOTP no configurado');
    }

    const encKey = this.config.get<string>('totp.encKey') || '';
    const secret = descifrar(user.totpSecretCifrado, encKey);
    const okTotp = authenticator.verify({ token: codigo, secret });
    if (!okTotp) {
      const okRecovery = await this.consumirCodigoRecuperacion(user, codigo);
      if (!okRecovery) throw new UnauthorizedException('Código inválido');
    }
    return this.generateAuthResponse(user);
  }

  /**
   * Paso 2 (primer login, enrolamiento forzado): confirma el código del QR recién
   * escaneado, habilita TOTP, devuelve access token + códigos de recuperación (una vez).
   */
  async loginEnrolarTotp(
    challengeToken: string,
    codigo: string,
  ): Promise<AuthResponseDto & { codigosRecuperacion: string[] }> {
    const { sub: userId, tokenVersion } =
      this.verificarChallenge(challengeToken);
    const userPrevio = await this.userModel.findById(userId);
    if (
      !userPrevio ||
      !userPrevio.activo ||
      (userPrevio.tokenVersion ?? 0) !== tokenVersion
    ) {
      throw new UnauthorizedException();
    }
    const { codigosRecuperacion } = await this.confirmarTotp(userId, codigo);
    const user = await this.userModel.findById(userId);
    if (!user) throw new UnauthorizedException();
    return { ...this.generateAuthResponse(user), codigosRecuperacion };
  }

  /** Verifica el challenge de pre-auth y devuelve el userId + tokenVersion. */
  private verificarChallenge(token: string): {
    sub: string;
    tokenVersion: number;
  } {
    try {
      const payload = this.jwtService.verify<{
        sub: string;
        scope?: string;
        tokenVersion?: number;
      }>(token);
      if (payload.scope !== 'pre-2fa') throw new Error('scope inválido');
      return { sub: payload.sub, tokenVersion: payload.tokenVersion ?? 0 };
    } catch {
      throw new UnauthorizedException(
        'La sesión de login expiró, volvé a ingresar tu contraseña',
      );
    }
  }

  /** Consume un código de recuperación (bcrypt, single-use). true si era válido. */
  private async consumirCodigoRecuperacion(
    user: UserDocument,
    codigo: string,
  ): Promise<boolean> {
    // Recorre TODOS los códigos (sin early-return) para no filtrar por timing la posición del match.
    let matchHash: string | null = null;
    for (const hash of user.codigosRecuperacion) {
      if (await bcrypt.compare(codigo, hash)) matchHash = hash;
    }
    if (!matchHash) return false;
    // Consumo atómico: $pull condicionado a que el hash siga presente → single-use real
    // aunque dos requests usen el mismo código en paralelo (solo uno modifica).
    const res = await this.userModel.updateOne(
      { _id: user._id, codigosRecuperacion: matchHash },
      { $pull: { codigosRecuperacion: matchHash } },
    );
    return res.modifiedCount === 1;
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
    const user = await this.userModel
      .findByIdAndUpdate(userId, dto, { new: true })
      .select('-password');
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

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Usuario no encontrado');
    const valid = await bcrypt.compare(oldPassword, user.password);
    if (!valid) throw new UnauthorizedException('Contraseña actual incorrecta');
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword)
      throw new BadRequestException(
        'La nueva contraseña no puede ser igual a la contraseña actual',
      );
    user.password = await bcrypt.hash(newPassword, 10);
    user.mustChangePassword = false;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    return this.generateAuthResponse(user);
  }

  // ── TOTP (segundo factor para step-up) ───────────────────────────────────

  /**
   * Inicia el enrolamiento TOTP: genera un secreto, lo guarda CIFRADO (provisional,
   * sin habilitar) y devuelve la URL otpauth + un QR para escanear con la app.
   */
  async enrolarTotp(
    userId: string,
  ): Promise<{ otpauthUrl: string; qrDataUrl: string }> {
    const encKey = this.config.get<string>('totp.encKey') || '';
    if (!encKey) {
      throw new BadRequestException(
        'TOTP no está configurado (falta TOTP_ENC_KEY)',
      );
    }
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Usuario no encontrado');

    // SEGURIDAD: nunca re-enrolar sobre un 2FA activo (evita downgrade/secuestro
    // con sesión robada). Para reconfigurar hay que revocar explícitamente primero.
    if (user.totpHabilitado) {
      throw new BadRequestException(
        'Ya tenés 2FA activo. Revocalo antes de configurar uno nuevo.',
      );
    }

    const secret = authenticator.generateSecret();
    // Se guarda en el campo PROVISIONAL — no toca totpSecretCifrado ni totpHabilitado
    // hasta que confirmarTotp valide un código.
    user.totpSecretProvisional = cifrar(secret, encKey);
    await user.save();

    const otpauthUrl = authenticator.keyuri(
      user.email,
      'Perc Suppliers',
      secret,
    );
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
    return { otpauthUrl, qrDataUrl };
  }

  /**
   * Confirma el enrolamiento: valida un código del autenticador, habilita TOTP y
   * devuelve códigos de recuperación de un solo uso (se muestran UNA vez; se guardan bcrypt-hasheados).
   */
  async confirmarTotp(
    userId: string,
    codigo: string,
  ): Promise<{ habilitado: boolean; codigosRecuperacion: string[] }> {
    const encKey = this.config.get<string>('totp.encKey') || '';
    const user = await this.userModel.findById(userId);
    if (!user || !user.totpSecretProvisional) {
      throw new BadRequestException('Primero iniciá el enrolamiento TOTP');
    }
    // Se valida contra el secreto PROVISIONAL, nunca contra el activo.
    const secret = descifrar(user.totpSecretProvisional, encKey);
    if (!authenticator.verify({ token: codigo, secret })) {
      throw new UnauthorizedException('Código TOTP inválido');
    }

    const plano = Array.from({ length: 8 }, () =>
      randomBytes(5).toString('hex'),
    );
    user.codigosRecuperacion = await Promise.all(
      plano.map((c) => bcrypt.hash(c, 10)),
    );
    // Recién acá se promueve el provisional al secreto activo.
    user.totpSecretCifrado = user.totpSecretProvisional;
    user.totpSecretProvisional = null;
    user.totpHabilitado = true;
    user.totpActivadoEn = new Date();
    await user.save();

    return { habilitado: true, codigosRecuperacion: plano };
  }

  /** Revoca el TOTP del usuario (admin tras pérdida de dispositivo, o el propio usuario). */
  async revocarTotp(userId: string): Promise<{ revocado: boolean }> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Usuario no encontrado');
    user.totpSecretCifrado = null;
    user.totpHabilitado = false;
    user.totpActivadoEn = null;
    user.codigosRecuperacion = [];
    await user.save();
    return { revocado: true };
  }

  private generateAuthResponse(user: UserDocument): AuthResponseDto {
    const payload = {
      sub: user._id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion ?? 0,
    };
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
