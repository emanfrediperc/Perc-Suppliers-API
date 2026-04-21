import { Controller, Get, Post, Patch, Param, Body, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as express from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { OrdenPagoService } from './orden-pago.service';
import { ExportService, ExportColumn } from '../../common/services/export.service';
import { CreateOrdenPagoDto } from './dto/create-orden-pago.dto';
import { UpdateOrdenPagoDto } from './dto/update-orden-pago.dto';
import { PagarOrdenDto } from './dto/pagar-orden.dto';
import { PagarLoteDto } from './dto/pagar-lote.dto';
import { OrdenPagoQueryDto } from './dto/orden-pago-query.dto';

@ApiTags('Ordenes de Pago')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ordenes-pago')
export class OrdenPagoController {
  constructor(
    private readonly service: OrdenPagoService,
    private readonly exportService: ExportService,
  ) {}

  @Post()
  @Roles('admin', 'tesoreria')
  create(@Body() dto: CreateOrdenPagoDto) { return this.service.create(dto); }

  @Get() findAll(@Query() query: OrdenPagoQueryDto) { return this.service.findAll(query); }
  @Get('export')
  async export(@Query() query: OrdenPagoQueryDto, @Query('formato') formato: string, @Res() res: express.Response) {
    const bigQuery = { ...query, page: 1, limit: 10000 };
    const result = await this.service.findAll(bigQuery);
    const columns: ExportColumn[] = [
      { header: 'Número', key: 'numero', type: 'text', width: 22 },
      { header: 'Fecha', key: 'fecha', type: 'date' },
      { header: 'Proveedor', key: 'empresaProveedora.razonSocial', type: 'text', width: 32 },
      { header: 'CUIT', key: 'empresaProveedora.cuit', type: 'cuit' },
      { header: 'Moneda', key: 'moneda', type: 'text', width: 10 },
      { header: 'Monto Total', key: 'montoTotal', type: 'currency' },
      { header: 'Pagado', key: 'montoPagado', type: 'currency' },
      { header: 'Saldo', key: 'saldoPendiente', type: 'currency' },
      { header: 'Estado', key: 'estado', type: 'text', width: 14 },
    ];
    const totalsRow = {
      numero: 'TOTAL',
      montoTotal: result.data.reduce((s, o: any) => s + (o.montoTotal || 0), 0),
      montoPagado: result.data.reduce((s, o: any) => s + (o.montoPagado || 0), 0),
      saldoPendiente: result.data.reduce((s, o: any) => s + (o.saldoPendiente || 0), 0),
    };
    const filterSummary = this.buildFilterSummary(query);
    if (formato === 'csv') {
      const csv = await this.exportService.generateCsv(result.data, columns);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=ordenes-pago.csv');
      res.send(csv);
    } else {
      const buffer = await this.exportService.generateExcel(result.data, columns, 'Ordenes de Pago', {
        title: 'Órdenes de Pago',
        filterSummary,
        totalsRow,
      });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=ordenes-pago.xlsx');
      res.send(buffer);
    }
  }

  private buildFilterSummary(query: OrdenPagoQueryDto): string | undefined {
    const parts: string[] = [];
    if ((query as any).estado) parts.push(`Estado: ${(query as any).estado}`);
    if ((query as any).search) parts.push(`Búsqueda: "${(query as any).search}"`);
    if ((query as any).desde) parts.push(`Desde: ${(query as any).desde}`);
    if ((query as any).hasta) parts.push(`Hasta: ${(query as any).hasta}`);
    return parts.length ? parts.join(' · ') : undefined;
  }

  @Get(':id') findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Patch(':id')
  @Roles('admin', 'tesoreria')
  update(@Param('id') id: string, @Body() dto: UpdateOrdenPagoDto) { return this.service.update(id, dto); }

  @Post('pagar-lote')
  @Roles('admin', 'tesoreria', 'operador')
  pagarLote(@Body() dto: PagarLoteDto) { return this.service.pagarLote(dto.pagos); }

  @Patch(':id/deactivate')
  @Roles('admin')
  deactivate(@Param('id') id: string) { return this.service.deactivate(id); }

  @Post(':id/pagar')
  @Roles('admin', 'tesoreria', 'operador')
  pagar(@Param('id') id: string, @Body() dto: PagarOrdenDto) { return this.service.pagar(id, dto); }

  @Post('sync-finnegans')
  @Roles('admin')
  syncFromFinnegans() { return this.service.syncFromFinnegans(); }
}
