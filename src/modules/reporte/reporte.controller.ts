import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as express from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ReporteService } from './reporte.service';
import { ExportService, ExportColumn } from '../../common/services/export.service';
import { ReporteQueryDto } from './dto/reporte-query.dto';

@ApiTags('Reportes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reportes')
export class ReporteController {
  constructor(
    private readonly service: ReporteService,
    private readonly exportService: ExportService,
  ) {}

  // ============ EXPORT ENDPOINTS (must be before base routes) ============

  @Get('pagos-por-periodo/export')
  async exportPagosPorPeriodo(@Query() dto: ReporteQueryDto, @Res() res: express.Response) {
    const data = await this.service.getPagosPorPeriodo(dto);
    const columns: ExportColumn[] = [
      { header: 'Periodo', key: 'periodo', width: 15 },
      { header: 'Cantidad', key: 'cantidad', width: 12 },
      { header: 'Monto Base', key: 'montoBase', width: 18 },
      { header: 'Monto Neto', key: 'montoNeto', width: 18 },
      { header: 'Ret. IIBB', key: 'retencionIIBB', width: 15 },
      { header: 'Ret. Ganancias', key: 'retencionGanancias', width: 15 },
      { header: 'Ret. IVA', key: 'retencionIVA', width: 15 },
      { header: 'Comision', key: 'comision', width: 15 },
      { header: 'Descuento', key: 'descuento', width: 15 },
    ];
    await this.sendExport(res, data.periodos, columns, 'pagos-por-periodo', dto.formato);
  }

  @Get('pagos-por-proveedor/export')
  async exportPagosPorProveedor(@Query() dto: ReporteQueryDto, @Res() res: express.Response) {
    const data = await this.service.getPagosPorProveedor(dto);
    const columns: ExportColumn[] = [
      { header: 'Proveedor', key: 'razonSocial', width: 30 },
      { header: 'Cantidad Pagos', key: 'cantidadPagos', width: 15 },
      { header: 'Monto Base', key: 'montoBase', width: 18 },
      { header: 'Monto Neto', key: 'montoNeto', width: 18 },
    ];
    await this.sendExport(res, data.proveedores, columns, 'pagos-por-proveedor', dto.formato);
  }

  @Get('retenciones-acumuladas/export')
  async exportRetencionesAcumuladas(@Query() dto: ReporteQueryDto, @Res() res: express.Response) {
    const data = await this.service.getRetencionesAcumuladas(dto);
    const columns: ExportColumn[] = [
      { header: 'Periodo', key: 'periodo', width: 15 },
      { header: 'IIBB', key: 'retencionIIBB', width: 15 },
      { header: 'Ganancias', key: 'retencionGanancias', width: 15 },
      { header: 'IVA', key: 'retencionIVA', width: 15 },
      { header: 'SUSS', key: 'retencionSUSS', width: 15 },
      { header: 'Otras', key: 'otrasRetenciones', width: 15 },
      { header: 'Total', key: 'total', width: 18 },
    ];
    await this.sendExport(res, data.periodos, columns, 'retenciones-acumuladas', dto.formato);
  }

  @Get('facturas-por-tipo/export')
  async exportFacturasPorTipo(@Query() dto: ReporteQueryDto, @Res() res: express.Response) {
    const data = await this.service.getFacturasPorTipo(dto);
    const columns: ExportColumn[] = [
      { header: 'Tipo', key: 'tipo', width: 10 },
      { header: 'Cantidad', key: 'cantidad', width: 12 },
      { header: 'Monto Total', key: 'montoTotal', width: 18 },
      { header: 'Monto Neto', key: 'montoNeto', width: 18 },
      { header: 'Monto IVA', key: 'montoIva', width: 18 },
    ];
    await this.sendExport(res, data.tipos, columns, 'facturas-por-tipo', dto.formato);
  }

  @Get('estado-cuenta-proveedor/export')
  async exportEstadoCuenta(@Query() dto: ReporteQueryDto, @Res() res: express.Response) {
    const data = await this.service.getEstadoCuentaProveedor(dto);
    const columns: ExportColumn[] = [
      { header: 'Numero', key: 'numero', width: 25 },
      { header: 'Tipo', key: 'tipo', width: 8 },
      { header: 'Fecha', key: 'fecha', width: 15, format: (v: any) => v ? new Date(v).toLocaleDateString('es-AR') : '' },
      { header: 'Vencimiento', key: 'fechaVencimiento', width: 15, format: (v: any) => v ? new Date(v).toLocaleDateString('es-AR') : '' },
      { header: 'Monto Total', key: 'montoTotal', width: 18 },
      { header: 'Pagado', key: 'montoPagado', width: 18 },
      { header: 'Saldo', key: 'saldoPendiente', width: 18 },
      { header: 'Estado', key: 'estado', width: 12 },
    ];
    await this.sendExport(res, data.facturas, columns, 'estado-cuenta', dto.formato);
  }

  @Get('comisiones-descuentos/export')
  async exportComisionesDescuentos(@Query() dto: ReporteQueryDto, @Res() res: express.Response) {
    const data = await this.service.getComisionesDescuentos(dto);
    const columns: ExportColumn[] = [
      { header: 'Proveedor', key: 'razonSocial', width: 30 },
      { header: 'Cantidad', key: 'cantidad', width: 15 },
      { header: 'Monto Base', key: 'montoBase', width: 18 },
      { header: 'Comision', key: 'comision', width: 18 },
      { header: 'Descuento', key: 'descuento', width: 18 },
    ];
    await this.sendExport(res, data.porProveedor, columns, 'comisiones-descuentos', dto.formato);
  }

  @Get('facturas-vencimiento/export')
  async exportFacturasVencimiento(@Query() dto: ReporteQueryDto, @Res() res: express.Response) {
    const data = await this.service.getFacturasVencimiento(dto);
    const columns: ExportColumn[] = [
      { header: 'Bucket', key: 'bucket', width: 15 },
      { header: 'Cantidad', key: 'cantidad', width: 12 },
      { header: 'Monto Total', key: 'montoTotal', width: 18 },
      { header: 'Saldo Pendiente', key: 'saldoPendiente', width: 18 },
    ];
    const rows = [...data.vencidas, ...data.porVencer];
    await this.sendExport(res, rows, columns, 'facturas-vencimiento', dto.formato);
  }

  // ============ BASE REPORT ENDPOINTS ============

  @Get('pagos-por-periodo')
  getPagosPorPeriodo(@Query() dto: ReporteQueryDto) { return this.service.getPagosPorPeriodo(dto); }

  @Get('pagos-por-proveedor')
  getPagosPorProveedor(@Query() dto: ReporteQueryDto) { return this.service.getPagosPorProveedor(dto); }

  @Get('facturas-vencimiento')
  getFacturasVencimiento(@Query() dto: ReporteQueryDto) { return this.service.getFacturasVencimiento(dto); }

  @Get('retenciones-acumuladas')
  getRetencionesAcumuladas(@Query() dto: ReporteQueryDto) { return this.service.getRetencionesAcumuladas(dto); }

  @Get('comisiones-descuentos')
  getComisionesDescuentos(@Query() dto: ReporteQueryDto) { return this.service.getComisionesDescuentos(dto); }

  @Get('estado-cuenta-proveedor')
  getEstadoCuentaProveedor(@Query() dto: ReporteQueryDto) { return this.service.getEstadoCuentaProveedor(dto); }

  @Get('estado-cuenta-completo/:empresaProveedoraId')
  getEstadoCuentaCompleto(@Param('empresaProveedoraId') empresaProveedoraId: string) {
    return this.service.getEstadoCuentaCompleto(empresaProveedoraId);
  }

  @Get('facturas-por-tipo')
  getFacturasPorTipo(@Query() dto: ReporteQueryDto) { return this.service.getFacturasPorTipo(dto); }

  // ============ HELPERS ============

  private async sendExport(res: express.Response, data: any[], columns: ExportColumn[], filename: string, formato = 'xlsx') {
    try {
      if (formato === 'csv') {
        const csv = await this.exportService.generateCsv(data, columns);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}.csv`);
        res.send(csv);
      } else {
        const buffer = await this.exportService.generateExcel(data, columns, filename);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}.xlsx`);
        res.send(buffer);
      }
    } catch (error) {
      console.error('Export error:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error generating export', error: error.message });
      }
    }
  }
}
