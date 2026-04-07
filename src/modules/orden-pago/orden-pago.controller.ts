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
      { header: 'Numero', key: 'numero', width: 20 },
      { header: 'Fecha', key: 'fecha', width: 15, format: (v: any) => v ? new Date(v).toLocaleDateString('es-AR') : '' },
      { header: 'Proveedor', key: 'empresaProveedora.razonSocial', width: 30 },
      { header: 'Monto Total', key: 'montoTotal', width: 18 },
      { header: 'Pagado', key: 'montoPagado', width: 18 },
      { header: 'Saldo', key: 'saldoPendiente', width: 18 },
      { header: 'Moneda', key: 'moneda', width: 10 },
      { header: 'Estado', key: 'estado', width: 12 },
    ];
    if (formato === 'csv') {
      const csv = await this.exportService.generateCsv(result.data, columns);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=ordenes-pago.csv');
      res.send(csv);
    } else {
      const buffer = await this.exportService.generateExcel(result.data, columns, 'Ordenes de Pago');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=ordenes-pago.xlsx');
      res.send(buffer);
    }
  }

  @Get(':id') findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Patch(':id')
  @Roles('admin', 'tesoreria')
  update(@Param('id') id: string, @Body() dto: UpdateOrdenPagoDto) { return this.service.update(id, dto); }

  @Post('pagar-lote')
  @Roles('admin', 'tesoreria')
  pagarLote(@Body() dto: PagarLoteDto) { return this.service.pagarLote(dto.pagos); }

  @Patch(':id/deactivate')
  @Roles('admin')
  deactivate(@Param('id') id: string) { return this.service.deactivate(id); }

  @Post(':id/pagar')
  @Roles('admin', 'tesoreria')
  pagar(@Param('id') id: string, @Body() dto: PagarOrdenDto) { return this.service.pagar(id, dto); }

  @Post('sync-finnegans')
  @Roles('admin')
  syncFromFinnegans() { return this.service.syncFromFinnegans(); }
}
