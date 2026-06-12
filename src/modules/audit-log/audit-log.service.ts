import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  /**
   * Secreto server-side para el HMAC de la cadena. Vive FUERA de la DB, así que un
   * insider con acceso de escritura a `audit_logs` no puede recomputar la cadena tras
   * editar registros. Vacío => SHA-256 plano (best-effort, sólo dev local).
   */
  private readonly hmacKey: string;

  constructor(
    @InjectModel(AuditLog.name) private auditModel: Model<AuditLogDocument>,
    private readonly config: ConfigService,
  ) {
    this.hmacKey = this.config.get<string>('audit.hmacKey') || '';
    if (!this.hmacKey) {
      this.logger.warn(
        'AUDIT_HMAC_KEY no configurada: la cadena del audit log usa SHA-256 plano ' +
          '(no resiste a un insider con acceso de escritura a la DB). Configurá AUDIT_HMAC_KEY en producción.',
      );
    }
  }

  async log(data: {
    usuario: string;
    usuarioEmail: string;
    accion: string;
    entidad: string;
    entidadId?: string;
    cambios?: Record<string, any>;
    ip?: string;
    userAgent?: string;
    descripcion?: string;
  }) {
    let prevHash = '';
    if (data.entidadId) {
      const last = await this.auditModel
        .findOne({
          entidad: data.entidad,
          entidadId: data.entidadId,
          hash: { $exists: true, $ne: null },
        })
        .sort({ createdAt: -1 })
        .select('hash')
        .lean();
      prevHash = last?.hash || '';
    }
    const hmac = !!this.hmacKey;
    const hash = this.computeHash(prevHash, this.canonicalEntry({ ...data, hmac }));
    return this.auditModel.create({
      ...data,
      hash,
      hmac,
      prevHash: prevHash || undefined,
    });
  }

  private canonicalEntry(e: Partial<AuditLog>) {
    return {
      usuario: e.usuario,
      usuarioEmail: e.usuarioEmail,
      accion: e.accion,
      entidad: e.entidad,
      entidadId: e.entidadId,
      cambios: e.cambios,
      ip: e.ip,
      userAgent: e.userAgent,
      descripcion: e.descripcion,
      // El flag de algoritmo entra al canonical: liga el hash a SU modo (HMAC vs plano),
      // así un insider no puede bajar una entry firmada con HMAC a SHA-256 plano sin
      // romper la cadena. `!!` normaliza undefined/null (legacy) a false.
      hmac: !!e.hmac,
    };
  }

  /**
   * Computa el hash determinístico de una entry. Excluye campos volátiles (timestamps de Mongo,
   * el propio hash) y serializa con keys ordenadas.
   *
   * Si hay AUDIT_HMAC_KEY -> HMAC-SHA256 con el secreto (el secreto vive fuera de la DB, así que
   * recomputar la cadena requiere el secreto). Sin clave -> SHA-256 plano (best-effort, sólo dev).
   * El modo se decide por el flag `entry.hmac` (no por la presencia de la clave en runtime), de
   * modo que verificar entradas históricas firmadas con HMAC siempre use HMAC.
   */
  private computeHash(prevHash: string, entry: Record<string, any>): string {
    const ordered = Object.keys(entry)
      .filter((k) => entry[k] !== undefined)
      .sort()
      .reduce<Record<string, any>>((acc, k) => {
        const v = entry[k];
        acc[k] = v instanceof Date ? v.toISOString() : v;
        return acc;
      }, {});
    const payload = prevHash + JSON.stringify(ordered);
    if (entry.hmac) {
      return createHmac('sha256', this.hmacKey).update(payload).digest('hex');
    }
    return createHash('sha256').update(payload).digest('hex');
  }

  /** Compara dos hashes hex en tiempo constante (evita timing oracle en la verificación). */
  private hashesMatch(a: string, b: string): boolean {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  }

  /**
   * Verifica integridad de la cadena de audit log para una entidad+entidadId.
   * Recorre los registros en orden cronológico y rechequea cada hash.
   */
  async verifyChain(entidad: string, entidadId: string) {
    const entries = await this.auditModel
      .find({ entidad, entidadId })
      .sort({ createdAt: 1 })
      .lean();
    if (entries.length === 0) {
      throw new NotFoundException(
        'No hay entradas de audit log para esta entidad',
      );
    }

    const sinHash = entries.filter((x) => !x.hash).length;
    let prev = '';
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i] as Partial<AuditLog>;

      if (!e.hash) {
        // Una entry firmada con HMAC NO puede quedar sin hash: si falta, es tampering
        // (un insider borró `hash` para evadir la verificación). Sólo toleramos la
        // ausencia en entradas legacy (hmac=false/undefined, pre-feature).
        if (e.hmac) {
          return {
            valid: false,
            brokenAt: i,
            total: entries.length,
            sinHash,
            motivo: 'entry-firmada-sin-hash',
          };
        }
        // Entry pre-hash-chain (anteriores al feature). No rompe `prev`: no aporta a la cadena.
        continue;
      }

      // Una entry marcada como HMAC sólo se puede verificar con el secreto presente.
      // Si no está, no podemos afirmar integridad => la tratamos como NO verificable
      // (no devolvemos valid:true a ciegas, que era exactamente el agujero original).
      if (e.hmac && !this.hmacKey) {
        return {
          valid: false,
          brokenAt: i,
          total: entries.length,
          sinHash,
          motivo: 'sin-clave-para-verificar-hmac',
        };
      }

      // Anti-downgrade: con una clave activa, toda entry nueva se firma con HMAC (hmac=true).
      // Si aparece una entry con hash pero hmac=false mientras hay clave, es un insider que
      // intentó bajar la cadena a SHA-256 plano (que SÍ puede recomputar sin el secreto).
      // Lo tratamos como tampering. (Las entradas legacy genuinas no tienen hash y caen arriba.)
      if (!e.hmac && this.hmacKey) {
        return {
          valid: false,
          brokenAt: i,
          total: entries.length,
          sinHash,
          motivo: 'downgrade-a-sha256-plano',
        };
      }

      const expected = this.computeHash(prev, this.canonicalEntry(e));
      if (!this.hashesMatch(e.hash, expected)) {
        return {
          valid: false,
          brokenAt: i,
          total: entries.length,
          sinHash,
        };
      }
      prev = e.hash;
    }
    return {
      valid: true,
      brokenAt: null,
      total: entries.length,
      sinHash,
    };
  }

  async findAll(
    query: AuditLogQueryDto,
  ): Promise<PaginatedResponseDto<AuditLogDocument>> {
    const { page, limit, entidad, entidadId, usuario, accion } = query;
    const filter: any = {};
    if (entidad) filter.entidad = entidad;
    if (entidadId) filter.entidadId = entidadId;
    if (usuario) filter.usuario = usuario;
    if (accion) filter.accion = accion;

    const [data, total] = await Promise.all([
      this.auditModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      this.auditModel.countDocuments(filter),
    ]);
    return new PaginatedResponseDto(data, total, page, limit);
  }

  async findByEntity(
    entidad: string,
    entidadId: string,
  ): Promise<AuditLogDocument[]> {
    return this.auditModel
      .find({ entidad, entidadId })
      .sort({ createdAt: -1 })
      .limit(50);
  }
}
