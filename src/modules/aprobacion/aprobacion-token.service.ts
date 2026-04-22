import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash } from 'crypto';
import { AprobacionToken, AprobacionTokenDocument } from './schemas/aprobacion-token.schema';

@Injectable()
export class AprobacionTokenService {
  constructor(
    @InjectModel(AprobacionToken.name) private tokenModel: Model<AprobacionTokenDocument>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Emite un nuevo token one-time para el par (aprobacionId, userId).
   * Invalida cualquier token previo pendiente para el mismo par antes de crear uno nuevo.
   * Devuelve el token crudo (base64url, 32 bytes de entropía).
   * El llamador es responsable de componer la URL de redirección.
   */
  async issueForAprobador(
    aprobacionId: string,
    userId: string,
    userEmail: string,
  ): Promise<string> {
    // Invalidar tokens anteriores no usados para este par (aprobacionId, userId)
    await this.tokenModel.updateMany(
      { aprobacionId, userId, usado: false },
      { usado: true, usadoEn: new Date() },
    );

    // Generar token crudo
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);

    // Calcular expiración a partir de la config
    const ttlHours = this.configService.get<number>('magicLink.ttlHours') ?? 48;
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    await this.tokenModel.create({
      aprobacionId,
      userId,
      userEmail,
      tokenHash,
      expiresAt,
      usado: false,
      usadoEn: null,
      ip: null,
      userAgent: null,
    });

    return rawToken;
  }

  /**
   * Verifica que el token crudo sea válido: existe, no fue usado, y no expiró.
   * Lanza UnauthorizedException con mensaje genérico en cualquier caso inválido
   * para no filtrar información sobre la existencia del token.
   */
  async verify(rawToken: string): Promise<AprobacionTokenDocument> {
    const tokenHash = this.hashToken(rawToken);
    const doc = await this.tokenModel.findOne({ tokenHash });

    if (!doc || doc.usado || doc.expiresAt < new Date()) {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    return doc;
  }

  /**
   * Marca el token como usado y registra metadatos de auditoría (ip, userAgent).
   * Luego invalida todos los tokens hermanos pendientes (mismo aprobacionId + userId)
   * para prevenir re-entradas si se emiten nuevos tokens en el futuro.
   */
  async consume(
    tokenDoc: AprobacionTokenDocument,
    ip: string,
    userAgent: string,
  ): Promise<void> {
    tokenDoc.usado = true;
    tokenDoc.usadoEn = new Date();
    tokenDoc.ip = ip;
    tokenDoc.userAgent = userAgent;
    await tokenDoc.save();

    // Invalidar tokens hermanos del mismo (aprobacionId, userId) que aún estén pendientes
    await this.tokenModel.updateMany(
      {
        aprobacionId: tokenDoc.aprobacionId,
        userId: tokenDoc.userId,
        _id: { $ne: tokenDoc._id },
        usado: false,
      },
      { usado: true, usadoEn: new Date() },
    );
  }

  /**
   * Invalida todos los tokens pendientes de una aprobación (todos los aprobadores).
   * Usado por el flujo de reenvío antes de emitir tokens de un nuevo ciclo.
   */
  async invalidateAllForAprobacion(aprobacionId: string): Promise<void> {
    await this.tokenModel.updateMany(
      { aprobacionId, usado: false },
      { usado: true, usadoEn: new Date() },
    );
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
