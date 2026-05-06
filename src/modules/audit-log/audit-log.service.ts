import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash } from 'crypto';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectModel(AuditLog.name) private auditModel: Model<AuditLogDocument>,
  ) {}

  async log(data: {
    usuario: string;
    usuarioEmail: string;
    accion: string;
    entidad: string;
    entidadId?: string;
    cambios?: Record<string, any>;
    ip?: string;
    descripcion?: string;
  }) {
    let prevHash = '';
    if (data.entidadId) {
      const last = await this.auditModel
        .findOne({ entidad: data.entidad, entidadId: data.entidadId, hash: { $exists: true, $ne: null } })
        .sort({ createdAt: -1 })
        .select('hash')
        .lean();
      prevHash = last?.hash || '';
    }
    const hash = this.computeHash(prevHash, this.canonicalEntry(data));
    return this.auditModel.create({ ...data, hash, prevHash: prevHash || undefined });
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
      descripcion: e.descripcion,
    };
  }

  /**
   * Computa hash determinístico de una entry. Excluye campos volátiles (timestamps creados por Mongo,
   * el propio hash) y serializa con keys ordenadas.
   */
  private computeHash(prevHash: string, entry: Record<string, any>): string {
    const ordered = Object.keys(entry)
      .filter(k => entry[k] !== undefined)
      .sort()
      .reduce<Record<string, any>>((acc, k) => {
        const v = entry[k];
        acc[k] = v instanceof Date ? v.toISOString() : v;
        return acc;
      }, {});
    return createHash('sha256').update(prevHash + JSON.stringify(ordered)).digest('hex');
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
      throw new NotFoundException('No hay entradas de audit log para esta entidad');
    }

    let prev = '';
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (!e.hash) {
        // Entry pre-hash-chain (anteriores al feature). No las verificamos pero seguimos.
        continue;
      }
      const expected = this.computeHash(prev, this.canonicalEntry(e as any));
      if (e.hash !== expected) {
        return { valid: false, brokenAt: i, total: entries.length, sinHash: entries.filter(x => !x.hash).length };
      }
      prev = e.hash;
    }
    return { valid: true, brokenAt: null, total: entries.length, sinHash: entries.filter(x => !x.hash).length };
  }

  async findAll(query: AuditLogQueryDto): Promise<PaginatedResponseDto<AuditLogDocument>> {
    const { page, limit, entidad, entidadId, usuario, accion } = query;
    const filter: any = {};
    if (entidad) filter.entidad = entidad;
    if (entidadId) filter.entidadId = entidadId;
    if (usuario) filter.usuario = usuario;
    if (accion) filter.accion = accion;

    const [data, total] = await Promise.all([
      this.auditModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      this.auditModel.countDocuments(filter),
    ]);
    return new PaginatedResponseDto(data, total, page, limit);
  }

  async findByEntity(entidad: string, entidadId: string): Promise<AuditLogDocument[]> {
    return this.auditModel.find({ entidad, entidadId }).sort({ createdAt: -1 }).limit(50);
  }
}
