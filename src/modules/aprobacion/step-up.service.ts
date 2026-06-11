import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import {
  DesafioStepUp,
  DesafioStepUpDocument,
} from './schemas/desafio-step-up.schema';
import { AprobacionTokenService } from './aprobacion-token.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { User, UserDocument } from '../../auth/schemas/user.schema';
import { descifrar } from '../../common/utils/cifrado.util';

const MAX_INTENTOS = 5;
const LOCK_MINUTOS = 15;
const DESAFIO_TTL_MIN = 10;

type Factor = 'password' | 'totp';

/**
 * Maneja el segundo factor (step-up) del flujo de aprobación por magic-link.
 *
 * Garantías de seguridad:
 *  - El desafío y el proof están scoped a (aprobacionId, userId) DERIVADOS del token.
 *  - El magic-link token NO se consume acá — sólo al registrar la decisión — para que
 *    un secreto incorrecto no queme el link (evita DoS / reenvío forzado).
 *  - Proof single-use, guardado sólo como hash. Lockout por desafío + por usuario.
 */
@Injectable()
export class StepUpService {
  private readonly logger = new Logger(StepUpService.name);

  constructor(
    @InjectModel(DesafioStepUp.name)
    private readonly desafioModel: Model<DesafioStepUpDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly tokenService: AprobacionTokenService,
    private readonly auditLogService: AuditLogService,
    private readonly config: ConfigService,
  ) {}

  /** ¿El aprobador tiene TOTP enrolado y confirmado? */
  async aprobadorEnrolado(userId: string): Promise<boolean> {
    const user = await this.userModel.findById(userId).select('totpHabilitado');
    return !!user?.totpHabilitado;
  }

  /**
   * Resuelve el factor efectivo: si se pide TOTP pero el aprobador no está enrolado,
   * degrada a password para no bloquear el pago (fallback configurable a futuro).
   */
  private resolverFactor(
    factorConfig: Factor,
    totpHabilitado: boolean,
  ): Factor {
    if (factorConfig === 'totp' && !totpHabilitado) return 'password';
    return factorConfig;
  }

  /**
   * Crea un desafío de step-up para el token dado. No consume el token.
   * Devuelve el id del desafío y el factor efectivo a presentar.
   */
  async iniciarDesafio(
    rawToken: string,
    factorConfig: Factor,
    ip: string,
    userAgent: string,
  ): Promise<{
    desafioId: string;
    factorRequerido: Factor;
    expiraEn: Date;
    intentosRestantes: number;
  }> {
    const tokenDoc = await this.tokenService.verify(rawToken);
    const user = await this.userModel.findById(tokenDoc.userId);
    if (!user) throw new UnauthorizedException('Token inválido o expirado');

    // Lockout por usuario: no permitir crear nuevos desafíos si está bloqueado
    // (evita el bypass de "recrear desafío" para seguir probando).
    if (user.stepUpBloqueadoHasta && user.stepUpBloqueadoHasta > new Date()) {
      throw new UnauthorizedException(
        'Demasiados intentos. Esperá unos minutos y reintentá.',
      );
    }

    const factor = this.resolverFactor(factorConfig, !!user.totpHabilitado);
    const expiresAt = new Date(Date.now() + DESAFIO_TTL_MIN * 60_000);

    const desafio = await this.desafioModel.create({
      aprobacionId: tokenDoc.aprobacionId,
      userId: tokenDoc.userId,
      userEmail: tokenDoc.userEmail,
      factorRequerido: factor,
      expiresAt,
      ip,
      userAgent,
    });

    this.audit(
      tokenDoc.userId,
      user.email,
      'step-up-iniciado',
      tokenDoc.aprobacionId.toString(),
      { factor },
      ip,
      userAgent,
    );

    return {
      desafioId: (desafio._id as any).toString(),
      factorRequerido: factor,
      expiraEn: expiresAt,
      intentosRestantes: MAX_INTENTOS,
    };
  }

  /**
   * Verifica el segundo factor. Si pasa, emite un proof single-use (devuelto crudo,
   * guardado como hash). Si falla, aplica lockout. Mensajes genéricos.
   */
  async verificarDesafio(
    rawToken: string,
    desafioId: string,
    secreto: string,
    ip: string,
    userAgent: string,
  ): Promise<{ stepUpProof: string }> {
    const tokenDoc = await this.tokenService.verify(rawToken);
    const desafio = await this.cargarDesafioScoped(desafioId, tokenDoc);

    const ahora = new Date();
    if (desafio.bloqueadoHasta && desafio.bloqueadoHasta > ahora) {
      throw new UnauthorizedException(
        'Demasiados intentos. Esperá unos minutos y reintentá.',
      );
    }
    if (desafio.satisfecho) {
      throw new BadRequestException('El desafío ya fue satisfecho');
    }

    const user = await this.userModel.findById(tokenDoc.userId);
    if (!user) throw new UnauthorizedException('Token inválido o expirado');

    // Lockout por usuario (no se evade recreando desafíos): gate antes de validar.
    if (user.stepUpBloqueadoHasta && user.stepUpBloqueadoHasta > ahora) {
      throw new UnauthorizedException(
        'Demasiados intentos. Esperá unos minutos y reintentá.',
      );
    }

    const ok = await this.validarSecreto(
      desafio.factorRequerido as Factor,
      secreto,
      user,
    );

    if (!ok) {
      desafio.intentosFallidos += 1;
      if (desafio.intentosFallidos >= MAX_INTENTOS) {
        desafio.bloqueadoHasta = new Date(
          ahora.getTime() + LOCK_MINUTOS * 60_000,
        );
      }
      await desafio.save();
      // Lockout por usuario además del lockout por desafío (no se evade recreando desafíos).
      user.stepUpIntentosFallidos = (user.stepUpIntentosFallidos || 0) + 1;
      if (user.stepUpIntentosFallidos >= MAX_INTENTOS) {
        user.stepUpBloqueadoHasta = new Date(
          ahora.getTime() + LOCK_MINUTOS * 60_000,
        );
        user.stepUpIntentosFallidos = 0;
      }
      await user.save();
      const bloqueado = !!desafio.bloqueadoHasta;
      this.audit(
        tokenDoc.userId,
        user.email,
        bloqueado ? 'step-up-bloqueado' : 'step-up-fallido',
        tokenDoc.aprobacionId.toString(),
        {
          intentosFallidos: desafio.intentosFallidos,
          factor: desafio.factorRequerido,
        },
        ip,
        userAgent,
      );
      throw new UnauthorizedException('Segundo factor incorrecto');
    }

    // Éxito: emitir proof single-use (raw devuelto, hash guardado)
    const rawProof = randomBytes(32).toString('base64url');
    desafio.proofHash = this.hash(rawProof);
    desafio.satisfecho = true;
    desafio.factorUsado = desafio.factorRequerido;
    desafio.intentosFallidos = 0;
    desafio.bloqueadoHasta = null;
    await desafio.save();

    if (user.stepUpIntentosFallidos || user.stepUpBloqueadoHasta) {
      user.stepUpIntentosFallidos = 0;
      user.stepUpBloqueadoHasta = null;
      await user.save();
    }

    this.audit(
      tokenDoc.userId,
      user.email,
      'step-up-satisfecho',
      tokenDoc.aprobacionId.toString(),
      { factorUsado: desafio.factorUsado, desafioId },
      ip,
      userAgent,
    );

    return { stepUpProof: rawProof };
  }

  /**
   * Valida y consume el proof al momento de decidir. Lanza si es inválido/reusado/fuera de scope.
   * Devuelve la metadata de step-up para estampar en la decisión.
   */
  async validarYConsumirProof(
    aprobacionId: string,
    userId: string,
    desafioId: string,
    rawProof: string,
  ): Promise<{ factorUsado: string | null; desafioId: string }> {
    // Consumo ATÓMICO: marca proofUsado=true sólo si TODO coincide y sigue sin usar.
    // Dos requests concurrentes con el mismo proof → sólo uno matchea (single-use real).
    const desafio = await this.desafioModel.findOneAndUpdate(
      {
        _id: desafioId,
        aprobacionId,
        userId,
        satisfecho: true,
        proofUsado: false,
        proofHash: this.hash(rawProof),
        expiresAt: { $gt: new Date() },
      },
      { $set: { proofUsado: true } },
      { new: false },
    );
    if (!desafio) {
      throw new UnauthorizedException('Step-up requerido o inválido');
    }
    return { factorUsado: desafio.factorUsado, desafioId };
  }

  private async cargarDesafioScoped(
    desafioId: string,
    tokenDoc: { aprobacionId: any; userId: string },
  ): Promise<DesafioStepUpDocument> {
    const desafio = await this.desafioModel.findById(desafioId);
    if (
      !desafio ||
      desafio.aprobacionId.toString() !== tokenDoc.aprobacionId.toString() ||
      desafio.userId !== tokenDoc.userId ||
      desafio.expiresAt < new Date()
    ) {
      throw new UnauthorizedException('Desafío inválido o expirado');
    }
    return desafio;
  }

  private async validarSecreto(
    factor: Factor,
    secreto: string,
    user: UserDocument,
  ): Promise<boolean> {
    if (factor === 'password') {
      return bcrypt.compare(secreto, user.password);
    }
    // TOTP
    if (!user.totpHabilitado || !user.totpSecretCifrado) return false;
    const encKey = this.config.get<string>('totp.encKey') || '';
    try {
      const secret = descifrar(user.totpSecretCifrado, encKey);
      return authenticator.verify({ token: secreto, secret });
    } catch (e: any) {
      this.logger.warn(`TOTP verify falló: ${e?.message ?? e}`);
      return false;
    }
  }

  private hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private audit(
    usuario: string,
    usuarioEmail: string,
    accion: string,
    aprobacionId: string,
    cambios: Record<string, any>,
    ip: string,
    userAgent: string,
  ): void {
    this.auditLogService
      .log({
        usuario,
        usuarioEmail,
        accion,
        entidad: 'aprobaciones',
        entidadId: aprobacionId,
        cambios,
        ip,
        userAgent,
        descripcion: `${usuarioEmail} - ${accion} aprobaciones ${aprobacionId}`,
      })
      .catch((e) =>
        this.logger.warn(`accion best-effort fallo: ${e?.message ?? e}`),
      );
  }
}
