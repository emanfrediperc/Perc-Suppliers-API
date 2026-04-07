import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';

@Injectable()
export class AuditLogService {
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
    return this.auditModel.create(data);
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
