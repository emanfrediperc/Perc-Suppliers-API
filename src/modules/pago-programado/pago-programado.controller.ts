import { Controller, Get, Post, Patch, Param, Body, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as express from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { PagoProgramadoService } from './pago-programado.service';
import { CreatePagoProgramadoDto } from './dto/create-pago-programado.dto';
import { ExportService, ExportColumn } from '../../common/services/export.service';

@ApiTags('Pagos Programados')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pagos-programados')
export class PagoProgramadoController {
  constructor(
    private readonly service: PagoProgramadoService,
    private readonly exportService: ExportService,
  ) {}

  @Post()
  @Roles('admin', 'tesoreria')
  create(@Body() dto: CreatePagoProgramadoDto, @CurrentUser() user: any) {
    return this.service.create(dto, user?.email);
  }

  @Get()
  findAll(@Query('estado') estado?: string, @Query('page') page?: number, @Query('limit') limit?: number) {
    return this.service.findAll({ estado, page: page ? +page : undefined, limit: limit ? +limit : undefined });
  }

  @Get('proximos')
  getProximos(@Query('dias') dias?: number) {
    return this.service.getProximos(dias ? +dias : 7);
  }

  @Get('export')
  async export(
    @Query('estado') estado: string | undefined,
    @Query('formato') formato: string,
    @Res() res: express.Response,
  ) {
    const result = await this.service.findAll({ estado, page: 1, limit: 10000 });
    const columns: ExportColumn[] = [
      { header: 'Fecha Programada', key: 'fechaProgramada', type: 'datetime' },
      { header: 'Orden de Pago', key: 'ordenPago.numero', type: 'text', width: 22 },
      { header: 'Proveedor', key: 'ordenPago.empresaProveedora.razonSocial', type: 'text', width: 32 },
      { header: 'Monto Base', key: 'montoBase', type: 'currency' },
      { header: 'Medio Pago', key: 'medioPago', type: 'text', width: 16 },
      { header: 'Referencia', key: 'referenciaPago', type: 'text', width: 22 },
      { header: 'Estado', key: 'estado', type: 'text', width: 14 },
      { header: 'Error', key: 'errorMensaje', type: 'text', width: 30 },
    ];
    const totalsRow = {
      fechaProgramada: 'TOTAL',
      montoBase: result.data.reduce((s: number, p: any) => s + (p.montoBase || 0), 0),
    };
    const filterSummary = estado ? `Estado: ${estado}` : undefined;
    if (formato === 'csv') {
      const csv = await this.exportService.generateCsv(result.data, columns);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=pagos-programados.csv');
      res.send(csv);
    } else {
      const buffer = await this.exportService.generateExcel(result.data, columns, 'Pagos Programados', {
        title: 'Pagos Programados', filterSummary, totalsRow,
      });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=pagos-programados.xlsx');
      res.send(buffer);
    }
  }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Patch(':id/cancelar')
  @Roles('admin', 'tesoreria', 'operador')
  cancelar(@Param('id') id: string) { return this.service.cancelar(id); }
}
