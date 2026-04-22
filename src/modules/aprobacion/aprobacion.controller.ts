import { Controller, Get, Patch, Post, Param, Body, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import * as express from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AprobacionService } from './aprobacion.service';
import { DecidirAprobacionDto } from './dto/decidir-aprobacion.dto';
import { ExportService, ExportColumn } from '../../common/services/export.service';

@ApiTags('Aprobaciones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('aprobaciones')
export class AprobacionController {
  constructor(
    private readonly service: AprobacionService,
    private readonly exportService: ExportService,
  ) {}

  @Get('pendientes')
  @Roles('admin', 'aprobador')
  findPendientes() {
    return this.service.findPendientes();
  }

  @Get('count')
  @Roles('admin', 'aprobador')
  countPendientes() {
    return this.service.countPendientes();
  }

  @Get('export')
  @Roles('admin', 'tesoreria', 'aprobador')
  async export(@Query('formato') formato: string, @Res() res: express.Response) {
    const data = await this.service.findAll();
    const columns: ExportColumn[] = [
      { header: 'Fecha Solicitud', key: 'createdAt', type: 'datetime' },
      { header: 'Tipo', key: 'tipo', type: 'text', width: 18 },
      { header: 'Entidad', key: 'entidad', type: 'text', width: 16 },
      { header: 'Descripción', key: 'descripcion', type: 'text', width: 40 },
      { header: 'Monto', key: 'monto', type: 'currency' },
      { header: 'Solicitado Por', key: 'createdByEmail', type: 'text', width: 28 },
      { header: 'Aprobaciones Requeridas', key: 'aprobacionesRequeridas', type: 'number' },
      {
        header: 'Aprobaciones Recibidas',
        key: 'aprobaciones',
        type: 'number',
        format: (v: any) => (Array.isArray(v) ? v.length : 0),
      },
      { header: 'Estado', key: 'estado', type: 'text', width: 14 },
    ];
    const totalsRow = {
      createdAt: 'TOTAL',
      monto: (data as any[]).reduce((s: number, a: any) => s + (a.monto || 0), 0),
    };
    if (formato === 'csv') {
      const csv = await this.exportService.generateCsv(data as any[], columns);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=aprobaciones.csv');
      res.send(csv);
    } else {
      const buffer = await this.exportService.generateExcel(data as any[], columns, 'Aprobaciones', {
        title: 'Aprobaciones', totalsRow,
      });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=aprobaciones.xlsx');
      res.send(buffer);
    }
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get('entidad/:entidad/:entidadId')
  findByEntity(@Param('entidad') entidad: string, @Param('entidadId') entidadId: string) {
    return this.service.findByEntity(entidad, entidadId);
  }

  /**
   * T032 — Reenviar una aprobación rechazada.
   * Solo el creador de la solicitud puede reenviarla (validado en el servicio).
   * Solo está disponible para roles admin y tesorería.
   */
  @Patch(':id/reenviar')
  @Roles('admin', 'tesoreria')
  @ApiOperation({
    summary: 'Reenviar una aprobación rechazada al aprobador',
    description:
      'Solo quien creó la solicitud (tesorería o admin) puede reenviarla. ' +
      'La aprobación debe estar en estado `rechazada` y tener `reenviosRestantes > 0`. ' +
      'El ciclo anterior se snapshotea en `intentos[]`; se emiten nuevos tokens y se envían nuevos emails.',
  })
  @ApiResponse({ status: 200, description: 'Aprobación reenviada — nuevo ciclo pendiente' })
  @ApiResponse({ status: 400, description: 'Estado inválido, sin reenvíos restantes, o sin aprobadores activos' })
  @ApiResponse({ status: 403, description: 'El usuario no es el creador original' })
  @ApiResponse({ status: 404, description: 'Aprobación no encontrada' })
  reenviar(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.reenviar(id, {
      userId: user.userId,
      email: user.email,
      nombre: user.nombre,
      role: user.role,
    });
  }

  @Patch(':id/decidir')
  @Roles('aprobador')
  decidir(
    @Param('id') id: string,
    @Body() dto: DecidirAprobacionDto,
    @CurrentUser() user: any,
  ) {
    return this.service.decidir(id, { userId: user.userId, email: user.email }, dto.decision, dto.comentario);
  }

  /**
   * Reenvía el mail magic-link a los aprobadores activos sin avanzar el
   * ciclo. Usado cuando el mail original no llegó (spam, SMTP transient).
   * No confundir con :id/reenviar que reinicia el ciclo tras un rechazo.
   */
  @Post(':id/reenviar-mail')
  @Roles('admin', 'aprobador', 'tesoreria')
  @ApiOperation({
    summary: 'Reenviar el mail magic-link a los aprobadores (aprobación pendiente)',
    description:
      'Invalida los tokens pendientes de cada aprobador activo, emite nuevos tokens y ' +
      'reenvía los emails. Solo funciona si la aprobación está en estado pendiente y si ' +
      'ENABLE_MAGIC_LINK=true.',
  })
  @ApiResponse({ status: 200, description: 'Mail reenviado', schema: { example: { mensaje: 'Mail reenviado a los aprobadores', destinatarios: 2 } } })
  @ApiResponse({ status: 400, description: 'Estado inválido, sin aprobadores, o flag deshabilitado' })
  @ApiResponse({ status: 404, description: 'Aprobación no encontrada' })
  reenviarMail(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.resendMagicLinks(id, { userId: user.userId, email: user.email });
  }
}
