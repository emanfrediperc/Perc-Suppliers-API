import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Res, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as express from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { PrestamosService } from './prestamos.service';
import { PrestamosDashboardService } from './prestamos-dashboard.service';
import { PrestamoDocument } from './schemas/prestamo.schema';
import { CreatePrestamoDto } from './dto/create-prestamo.dto';
import { UpdatePrestamoDto } from './dto/update-prestamo.dto';
import { RenewPrestamoDto } from './dto/renew-prestamo.dto';
import { QueryPrestamosDto } from './dto/query-prestamos.dto';
import { calculateInterest } from './helpers/interest-calculator';
import {
  ExportService,
  ExportColumn,
  WorkbookSheetConfig,
} from '../../common/services/export.service';

@ApiTags('Prestamos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('prestamos')
export class PrestamosController {
  constructor(
    private readonly service: PrestamosService,
    private readonly dashboardService: PrestamosDashboardService,
    private readonly exportService: ExportService,
  ) {}

  private enrichPrestamo(prestamo: PrestamoDocument) {
    const computed = calculateInterest(prestamo);
    const daysToMaturity = Math.floor(
      (new Date(prestamo.dueDate).getTime() - Date.now()) / 86_400_000,
    );
    return { ...prestamo.toObject(), computed: { ...computed, daysToMaturity } };
  }

  @Get()
  @Roles('admin', 'tesoreria', 'operador', 'consulta')
  async findAll(@Query() query: QueryPrestamosDto) {
    const prestamos = await this.service.findAll(query);
    return prestamos.map((p) => this.enrichPrestamo(p));
  }

  @Get('empresas/search')
  @Roles('admin', 'tesoreria', 'operador', 'consulta')
  searchEmpresas(@Query('q') q: string) {
    return this.service.searchEmpresas(q);
  }

  @Get('export')
  @Roles('admin', 'tesoreria', 'operador', 'consulta')
  async export(@Query() query: QueryPrestamosDto, @Query('formato') formato: string, @Res() res: express.Response) {
    // Fetch the 3 datasets with the same filters
    const prestamos = await this.service.findAll(query);
    const summary = await this.dashboardService.getSummary({ currency: query.currency });
    const netPos = await this.dashboardService.getNetPosition({ currency: query.currency });

    // Enrich prestamos so computed fields are available
    const enriched = prestamos.map((p) => this.enrichPrestamo(p));

    // Sheet 1 — main list
    const listadoCols: ExportColumn[] = [
      { header: 'Acreedor', key: 'lender.razonSocialCache', type: 'text', width: 32 },
      { header: 'Deudor', key: 'borrower.razonSocialCache', type: 'text', width: 32 },
      { header: 'Moneda', key: 'currency', type: 'text', width: 10 },
      { header: 'Capital', key: 'capital', type: 'currency' },
      { header: 'Tasa', key: 'rate', type: 'percent' },
      { header: 'Inicio', key: 'startDate', type: 'date' },
      { header: 'Vencimiento', key: 'dueDate', type: 'date' },
      { header: 'Días a Vencimiento', key: 'computed.daysToMaturity', type: 'number' },
      { header: 'Interés Acumulado', key: 'computed.interest', type: 'currency' },
      { header: 'Total', key: 'computed.total', type: 'currency' },
      { header: 'Vehículo', key: 'vehicle', type: 'text', width: 16 },
      { header: 'Estado', key: 'status', type: 'text', width: 14 },
    ];
    const listadoSheet: WorkbookSheetConfig = {
      name: 'Préstamos',
      columns: listadoCols,
      data: enriched,
    };

    // Sheet 2 — summary by currency
    const summarySheet: WorkbookSheetConfig = {
      name: 'Resumen por Moneda',
      columns: [
        { header: 'Moneda', key: 'currency', type: 'text', width: 12 },
        { header: 'Cantidad Activos', key: 'count', type: 'number' },
        { header: 'Capital Total', key: 'totalCapital', type: 'currency' },
        { header: 'Interés Total', key: 'totalInterest', type: 'currency' },
        { header: 'Total a Cobrar', key: 'totalAmount', type: 'currency' },
      ],
      data: summary.cards,
    };

    // Sheet 3 — net position (flatten all currencies into one table)
    const netPosRows: any[] = [];
    for (const pos of netPos.positions) {
      for (const ent of pos.entities) {
        netPosRows.push({
          currency: pos.currency,
          empresaKind: ent.empresaKind,
          name: ent.name,
          lent: ent.lent,
          borrowed: ent.borrowed,
          net: ent.net,
        });
      }
    }
    const netPosSheet: WorkbookSheetConfig = {
      name: 'Posición Neta',
      columns: [
        { header: 'Moneda', key: 'currency', type: 'text', width: 10 },
        { header: 'Empresa', key: 'name', type: 'text', width: 32 },
        { header: 'Tipo', key: 'empresaKind', type: 'text', width: 14 },
        { header: 'Prestó', key: 'lent', type: 'currency' },
        { header: 'Tomó', key: 'borrowed', type: 'currency' },
        { header: 'Neto', key: 'net', type: 'currency' },
      ],
      data: netPosRows,
    };

    // Filter summary
    const parts: string[] = [];
    if (query.status) parts.push(`Estado: ${query.status}`);
    if (query.currency) parts.push(`Moneda: ${query.currency}`);
    if (query.vehicle) parts.push(`Vehículo: ${query.vehicle}`);
    if (query.balanceCut) parts.push(`Corte: ${query.balanceCut}`);
    const filterSummary = parts.length ? parts.join(' · ') : undefined;

    if (formato === 'csv') {
      // CSV = single sheet fallback with the main list only
      const csv = await this.exportService.generateCsv(enriched, listadoCols);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=prestamos.csv');
      return res.send(csv);
    }

    const buffer = await this.exportService.generateWorkbook({
      title: 'Préstamos PERC',
      filterSummary,
      sheets: [listadoSheet, summarySheet, netPosSheet],
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=prestamos.xlsx');
    return res.send(buffer);
  }

  @Get(':id')
  @Roles('admin', 'tesoreria', 'operador', 'consulta')
  async findOne(@Param('id') id: string) {
    const prestamo = await this.service.findOne(id);
    return this.enrichPrestamo(prestamo);
  }

  @Post()
  @Roles('admin', 'tesoreria')
  create(@Body() dto: CreatePrestamoDto, @Req() req: any) {
    return this.service.create(dto, { userId: req.user.userId, email: req.user.email });
  }

  @Patch(':id')
  @Roles('admin', 'tesoreria')
  update(@Param('id') id: string, @Body() dto: UpdatePrestamoDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/clear')
  @Roles('admin', 'tesoreria', 'operador')
  clear(@Param('id') id: string) {
    return this.service.clear(id);
  }

  @Post(':id/renew')
  @Roles('admin', 'tesoreria', 'operador')
  renew(@Param('id') id: string, @Body() dto: RenewPrestamoDto) {
    return this.service.renew(id, dto);
  }

  @Delete(':id')
  @Roles('admin', 'tesoreria')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
