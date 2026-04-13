import { Controller, Get, Query, Param, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as express from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { AuditLogService } from './audit-log.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { ExportService, ExportColumn } from '../../common/services/export.service';

const MAX_EXPORT_ROWS = 10000;

@ApiTags('Audit Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit-logs')
export class AuditLogController {
  constructor(
    private readonly service: AuditLogService,
    private readonly exportService: ExportService,
  ) {}

  @Get()
  @Roles('admin')
  findAll(@Query() query: AuditLogQueryDto) {
    return this.service.findAll(query);
  }

  @Get('export')
  @Roles('admin')
  async export(@Query() query: AuditLogQueryDto, @Query('formato') formato: string, @Res() res: express.Response) {
    const bigQuery = { ...query, page: 1, limit: MAX_EXPORT_ROWS };
    const result = await this.service.findAll(bigQuery);
    const columns: ExportColumn[] = [
      { header: 'Fecha', key: 'createdAt', type: 'datetime' },
      { header: 'Usuario Email', key: 'usuarioEmail', type: 'text', width: 28 },
      { header: 'Acción', key: 'accion', type: 'text', width: 14 },
      { header: 'Entidad', key: 'entidad', type: 'text', width: 20 },
      { header: 'Entidad ID', key: 'entidadId', type: 'text', width: 26 },
      { header: 'IP', key: 'ip', type: 'text', width: 16 },
      { header: 'Descripción', key: 'descripcion', type: 'text', width: 42 },
    ];
    const parts: string[] = [];
    if (query.entidad) parts.push(`Entidad: ${query.entidad}`);
    if (query.accion) parts.push(`Acción: ${query.accion}`);
    if (query.usuario) parts.push(`Usuario: ${query.usuario}`);
    if (result.total > MAX_EXPORT_ROWS) {
      parts.push(`Máximo ${MAX_EXPORT_ROWS} registros más recientes (total: ${result.total})`);
    }
    const filterSummary = parts.length ? parts.join(' · ') : undefined;
    if (formato === 'csv') {
      const csv = await this.exportService.generateCsv(result.data, columns);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.csv');
      res.send(csv);
    } else {
      const buffer = await this.exportService.generateExcel(result.data, columns, 'Audit Logs', {
        title: 'Auditoría — Registros',
        filterSummary,
      });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.xlsx');
      res.send(buffer);
    }
  }

  @Get(':entidad/:entidadId')
  @Roles('admin', 'tesoreria', 'contabilidad', 'consulta')
  findByEntity(@Param('entidad') entidad: string, @Param('entidadId') entidadId: string) {
    return this.service.findByEntity(entidad, entidadId);
  }
}
