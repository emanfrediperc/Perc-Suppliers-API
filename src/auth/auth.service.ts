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

    const hashedPassword = await bcrypt.hash(registerDto.password, 12);
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
    // Lockout: el segundo factor reusa el contador de intentos fallidos del login.
    const ahora = new Date();
    if (user.lockUntil && user.lockUntil > ahora) {
      throw new UnauthorizedException(
        'Cuenta bloqueada por intentos fallidos. Intentá de nuevo en unos minutos.',
      );
    }
    if (!user.totpHabilitado || !user.totpSecretCifrado) {
      throw new UnauthorizedException('TOTP no configurado');
    }

    const encKey = this.config.get<string>('totp.encKey') || '';
    const secret = descifrar(user.totpSecretCifrado, encKey);
    // Single-use: rechaza el replay de un mismo código dentro de su ventana.
    const okTotp = await this.verificarTotpSingleUse(user, codigo, secret);
    if (!okTotp) {
      const okRecovery = await this.consumirCodigoRecuperacion(user, codigo);
      if (!okRecovery) {
        // Brute-force guard del segundo factor: 5 intentos → 15 min de bloqueo.
        user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
        if (user.failedLoginAttempts >= 5) {
          user.lockUntil = new Date(ahora.getTime() + 15 * 60 * 1000);
          user.failedLoginAttempts = 0;
        }
        await user.save();
        throw new UnauthorizedException('Código inválido');
      }
    }
    // Éxito: limpiar contador/lock.
    if (user.failedLoginAttempts > 0 || user.lockUntil) {
      user.failedLoginAttempts = 0;
      user.lockUntil = null;
      await user.save();
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
    // Lockout también en el enrolamiento (simetría con loginVerificarTotp).
    const ahora = new Date();
    if (userPrevio.lockUntil && userPrevio.lockUntil > ahora) {
      throw new UnauthorizedException(
        'Cuenta bloqueada por intentos fallidos. Intentá de nuevo en unos minutos.',
      );
    }
    let codigosRecuperacion: string[];
    try {
      ({ codigosRecuperacion } = await this.confirmarTotp(userId, codigo));
    } catch (e) {
      // Brute-force guard del código de enrolamiento. updateOne atómico para no
      // pisar lo que confirmarTotp pudiera haber escrito.
      const intentos = (userPrevio.failedLoginAttempts || 0) + 1;
      const set =
        intentos >= 5
          ? {
              failedLoginAttempts: 0,
              lockUntil: new Date(ahora.getTime() + 15 * 60 * 1000),
            }
          : { failedLoginAttempts: intentos };
      await this.userModel.updateOne({ _id: userId }, { $set: set });
      throw e;
    }
    // Éxito: limpiar contador sin pisar los campos TOTP que confirmarTotp guardó.
    if (userPrevio.failedLoginAttempts || userPrevio.lockUntil) {
      await this.userModel.updateOne(
        { _id: userId },
        { $set: { failedLoginAttempts: 0, lockUntil: null } },
      );
    }
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

  /**
   * Verifica un código TOTP y lo marca como CONSUMIDO (single-use real).
   * otplib por defecto acepta el mismo código tantas veces como se envíe dentro
   * de su ventana de 30s. Para cerrar el replay (login y step-up):
   *  - acotamos la tolerancia a window:1 (step actual + el anterior),
   *  - calculamos el step que matcheó (epoch/30s + delta),
   *  - lo aceptamos sólo si es > ultimoTotpStep,
   *  - persistimos atómicamente el nuevo step condicionado a que siga siendo el
   *    mayor (gana un solo request bajo concurrencia → single-use real).
   */
  async verificarTotpSingleUse(
    user: UserDocument,
    codigo: string,
    secret: string,
  ): Promise<boolean> {
    authenticator.options = { window: 1 };
    const delta = authenticator.checkDelta(codigo, secret);
    if (delta === null || delta === undefined) return false;

    const opciones = authenticator.allOptions();
    const stepSegundos = opciones.step ?? 30;
    const stepActual = Math.floor(Date.now() / 1000 / stepSegundos);
    const stepConsumido = stepActual + delta;

    // Replay: el código ya fue (o un código de un step posterior ya fue) usado.
    if (stepConsumido <= (user.ultimoTotpStep ?? 0)) return false;

    // Consumo atómico: sólo avanza si nadie consumió un step >= en paralelo.
    const res = await this.userModel.updateOne(
      {
        _id: user._id,
        $or: [
          { ultimoTotpStep: { $lt: stepConsumido } },
          { ultimoTotpStep: { $exists: false } },
        ],
      },
      { $set: { ultimoTotpStep: stepConsumido } },
    );
    if (res.modifiedCount !== 1) return false;
    user.ultimoTotpStep = stepConsumido;
    return true;
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
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Usuario no encontrado');

    // SEGURIDAD: cambiar role o activo afecta la autorización. Si no rotamos
    // tokenVersion, los access tokens ya emitidos siguen cargando el role viejo
    // y el RolesGuard los acepta hasta que expiren (JWT_EXPIRES_IN, default 24h).
    // Degradar/revocar privilegios via UI no tendría efecto inmediato.
    const cambiaRole = dto.role !== undefined && dto.role !== user.role;
    const cambiaActivo = dto.activo !== undefined && dto.activo !== user.activo;

    if (dto.nombre !== undefined) user.nombre = dto.nombre;
    if (dto.apellido !== undefined) user.apellido = dto.apellido;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.activo !== undefined) user.activo = dto.activo;

    if (cambiaRole || cambiaActivo) {
      user.tokenVersion = (user.tokenVersion || 0) + 1;
    }

    await user.save();
    const obj = user.toObject();
    delete (obj as any).password;
    return obj;
  }

  async resetPassword(userId: string): Promise<{ temporaryPassword: string }> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Usuario no encontrado');
    const temporaryPassword = randomBytes(9).toString('base64url');
    user.password = await bcrypt.hash(temporaryPassword, 12);
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
    user.password = await bcrypt.hash(newPassword, 12);
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
      plano.map((c) => bcrypt.hash(c, 12)),
    );
    // Recién acá se promueve el provisional al secreto activo.
    user.totpSecretCifrado = user.totpSecretProvisional;
    user.totpSecretProvisional = null;
    user.totpHabilitado = true;
    user.totpActivadoEn = new Date();
    await user.save();

    return { habilitado: true, codigosRecuperacion: plano };
  }

  /**
   * Revoca el TOTP del usuario (USO ADMINISTRATIVO: admin tras pérdida de
   * dispositivo). El path self-service va por revocarTotpPropio(), que exige
   * re-auth antes de delegar acá. NO exponer este método sin re-auth a un JWT
   * del propio usuario: apagar el 2FA es un downgrade de seguridad.
   */
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

  /**
   * Revocación self-service del 2FA propio, CON re-autenticación obligatoria.
   * Un access token robado no debe alcanzar para apagar el segundo factor de la
   * víctima: exigimos la contraseña actual y, si el usuario tiene TOTP activo, un
   * código TOTP (o de recuperación) válido. Al revocar se bumpea tokenVersion para
   * forzar re-login de todas las sesiones existentes.
   */
  async revocarTotpPropio(
    userId: string,
    password: string,
    codigo?: string,
  ): Promise<{ revocado: boolean }> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Usuario no encontrado');

    // 1) Re-auth por contraseña (siempre).
    const passwordOk = await bcrypt.compare(password, user.password);
    if (!passwordOk) {
      throw new UnauthorizedException('Contraseña actual incorrecta');
    }

    // 2) Segundo factor: si el usuario tiene 2FA activo, exigir un código válido
    //    (TOTP o recuperación) para evitar que solo-password apague el MFA.
    if (user.totpHabilitado) {
      if (!codigo) {
        throw new UnauthorizedException(
          'Ingresá un código TOTP o de recuperación válido para desactivar el 2FA',
        );
      }
      const encKey = this.config.get<string>('totp.encKey') || '';
      let totpOk = false;
      if (user.totpSecretCifrado) {
        const secret = descifrar(user.totpSecretCifrado, encKey);
        totpOk = await this.verificarTotpSingleUse(user, codigo, secret);
      }
      if (!totpOk) {
        const recoveryOk = await this.consumirCodigoRecuperacion(user, codigo);
        if (!recoveryOk) {
          throw new UnauthorizedException('Código inválido');
        }
      }
    }

    user.totpSecretCifrado = null;
    user.totpHabilitado = false;
    user.totpActivadoEn = null;
    user.codigosRecuperacion = [];
    // Invalida todos los tokens previos: forzar re-login tras el downgrade.
    user.tokenVersion = (user.tokenVersion || 0) + 1;
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
