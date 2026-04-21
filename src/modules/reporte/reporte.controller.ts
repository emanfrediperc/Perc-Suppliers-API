import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as express from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ReporteService } from './reporte.service';
import {
  ExportService,
  ExportColumn,
  WorkbookSheetConfig,
} from '../../common/services/export.service';
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
  @Roles('admin', 'tesoreria', 'operador', 'consulta')
  async exportPagosPorPeriodo(@Query() dto: ReporteQueryDto, @Res() res: express.Response) {
    const data = await this.service.getPagosPorPeriodo(dto);
    const columns: ExportColumn[] = [
      { header: 'Período', key: 'periodo', type: 'text', width: 14 },
      { header: 'Cantidad', key: 'cantidad', type: 'number' },
      { header: 'Monto Base', key: 'montoBase', type: 'currency' },
      { header: 'Monto Neto', key: 'montoNeto', type: 'currency' },
      { header: 'Ret. IIBB', key: 'retencionIIBB', type: 'currency' },
      { header: 'Ret. Ganancias', key: 'retencionGanancias', type: 'currency' },
      { header: 'Ret. IVA', key: 'retencionIVA', type: 'currency' },
      { header: 'Comisión', key: 'comision', type: 'currency' },
      { header: 'Descuento', key: 'descuento', type: 'currency' },
    ];
    const totalsRow = {
      periodo: 'TOTAL',
      cantidad: data.totales.cantidad,
      montoBase: data.totales.montoBase,
      montoNeto: data.totales.montoNeto,
      comision: data.totales.comision,
      descuento: data.totales.descuento,
    };
    await this.sendExport(res, data.periodos, columns, 'pagos-por-periodo', dto.formato, {
      title: 'Pagos por Período',
      filterSummary: this.buildDateFilter(dto),
      totalsRow,
    });
  }

  @Get('pagos-por-proveedor/export')
  @Roles('admin', 'tesoreria', 'operador', 'consulta')
  async exportPagosPorProveedor(@Query() dto: ReporteQueryDto, @Res() res: express.Response) {
    const data = await this.service.getPagosPorProveedor(dto);
    const columns: ExportColumn[] = [
      { header: 'Proveedor', key: 'razonSocial', type: 'text', width: 32 },
      { header: 'Cantidad Pagos', key: 'cantidadPagos', type: 'number' },
      { header: 'Monto Base', key: 'montoBase', type: 'currency' },
      { header: 'Monto Neto', key: 'montoNeto', type: 'currency' },
    ];
    const totalsRow = {
      razonSocial: 'TOTAL',
      cantidadPagos: data.proveedores.reduce((s: number, p: any) => s + (p.cantidadPagos || 0), 0),
      montoBase: data.proveedores.reduce((s: number, p: any) => s + (p.montoBase || 0), 0),
      montoNeto: data.proveedores.reduce((s: number, p: any) => s + (p.montoNeto || 0), 0),
    };
    await this.sendExport(res, data.proveedores, columns, 'pagos-por-proveedor', dto.formato, {
      title: 'Pagos por Proveedor',
      filterSummary: this.buildDateFilter(dto),
      totalsRow,
    });
  }

  @Get('retenciones-acumuladas/export')
  @Roles('admin', 'tesoreria', 'operador', 'consulta')
  async exportRetencionesAcumuladas(@Query() dto: ReporteQueryDto, @Res() res: express.Response) {
    const data = await this.service.getRetencionesAcumuladas(dto);
    const columns: ExportColumn[] = [
      { header: 'Período', key: 'periodo', type: 'text', width: 14 },
      { header: 'IIBB', key: 'retencionIIBB', type: 'currency' },
      { header: 'Ganancias', key: 'retencionGanancias', type: 'currency' },
      { header: 'IVA', key: 'retencionIVA', type: 'currency' },
      { header: 'SUSS', key: 'retencionSUSS', type: 'currency' },
      { header: 'Otras', key: 'otrasRetenciones', type: 'currency' },
      { header: 'Total', key: 'total', type: 'currency' },
    ];
    const totalsRow = {
      periodo: 'TOTAL',
      retencionIIBB: data.totales.retencionIIBB,
      retencionGanancias: data.totales.retencionGanancias,
      retencionIVA: data.totales.retencionIVA,
      retencionSUSS: data.totales.retencionSUSS,
      otrasRetenciones: data.totales.otrasRetenciones,
      total: data.totales.total,
    };
    await this.sendExport(res, data.periodos, columns, 'retenciones-acumuladas', dto.formato, {
      title: 'Retenciones Acumuladas',
      filterSummary: this.buildDateFilter(dto),
      totalsRow,
    });
  }

  @Get('facturas-por-tipo/export')
  @Roles('admin', 'tesoreria', 'operador', 'consulta')
  async exportFacturasPorTipo(@Query() dto: ReporteQueryDto, @Res() res: express.Response) {
    const data = await this.service.getFacturasPorTipo(dto);
    const columns: ExportColumn[] = [
      { header: 'Tipo', key: 'tipo', type: 'text', width: 12 },
      { header: 'Cantidad', key: 'cantidad', type: 'number' },
      { header: 'Monto Total', key: 'montoTotal', type: 'currency' },
      { header: 'Monto Neto', key: 'montoNeto', type: 'currency' },
      { header: 'Monto IVA', key: 'montoIva', type: 'currency' },
    ];
    const totalsRow = {
      tipo: 'TOTAL',
      cantidad: data.tipos.reduce((s: number, t: any) => s + (t.cantidad || 0), 0),
      montoTotal: data.tipos.reduce((s: number, t: any) => s + (t.montoTotal || 0), 0),
      montoNeto: data.tipos.reduce((s: number, t: any) => s + (t.montoNeto || 0), 0),
      montoIva: data.tipos.reduce((s: number, t: any) => s + (t.montoIva || 0), 0),
    };
    await this.sendExport(res, data.tipos, columns, 'facturas-por-tipo', dto.formato, {
      title: 'Facturas por Tipo',
      filterSummary: this.buildDateFilter(dto),
      totalsRow,
    });
  }

  /**
   * Estado de Cuenta — multi-sheet workbook (Resumen + Facturas + Pagos + NC/ND)
   * using getEstadoCuentaCompleto for the rich data shape.
   */
  @Get('estado-cuenta-proveedor/export')
  @Roles('admin', 'tesoreria', 'operador')
  async exportEstadoCuenta(@Query() dto: ReporteQueryDto, @Res() res: express.Response) {
    if (!dto.empresaProveedora) {
      return res.status(400).json({ message: 'Falta el parámetro empresaProveedora' });
    }
    const data = await this.service.getEstadoCuentaCompleto(dto.empresaProveedora);
    if (!data.proveedor) {
      return res.status(404).json({ message: 'Proveedor no encontrado' });
    }

    const prov = data.proveedor as any;
    const title = `Estado de Cuenta — ${prov.razonSocial}`;
    const filterSummary = `CUIT ${prov.cuit || '—'}`;

    // Sheet 1: Resumen (key/value table — proveedor info + pre-formatted totals)
    const fmtMoney = (n: number) =>
      new Intl.NumberFormat('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n);
    const cuitFmt = (c: string) => {
      const d = (c || '').replace(/\D/g, '');
      return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : c || '—';
    };
    const resumenRows = [
      { campo: 'Razón Social', valor: prov.razonSocial },
      { campo: 'CUIT', valor: cuitFmt(prov.cuit) },
      { campo: 'Condición IVA', valor: prov.condicionIva || '—' },
      { campo: 'Email', valor: prov.email || '—' },
      { campo: 'Teléfono', valor: prov.telefono || '—' },
      { campo: 'Dirección', valor: prov.direccion || '—' },
      { campo: 'CBU', valor: prov.datosBancarios?.cbu || '—' },
      { campo: '', valor: '' },
      { campo: 'Total Facturado', valor: `$ ${fmtMoney(data.totales.facturado)}` },
      { campo: 'Total Pagado', valor: `$ ${fmtMoney(data.totales.pagado)}` },
      { campo: 'Saldo Pendiente', valor: `$ ${fmtMoney(data.totales.saldoPendiente)}` },
      { campo: 'Total NC / ND', valor: `$ ${fmtMoney((data.totales as any).totalNC || 0)}` },
    ];
    const resumenSheet: WorkbookSheetConfig = {
      name: 'Resumen',
      columns: [
        { header: 'Campo', key: 'campo', type: 'text', width: 24 },
        { header: 'Valor', key: 'valor', type: 'text', width: 42 },
      ],
      data: resumenRows,
    };

    // Sheet 2: Facturas
    const facturasCols: ExportColumn[] = [
      { header: 'Número', key: 'numero', type: 'text', width: 22 },
      { header: 'Tipo', key: 'tipo', type: 'text', width: 10 },
      { header: 'Cliente', key: 'empresaCliente.razonSocial', type: 'text', width: 28 },
      { header: 'Fecha', key: 'fecha', type: 'date' },
      { header: 'Vencimiento', key: 'fechaVencimiento', type: 'date' },
      { header: 'Monto Total', key: 'montoTotal', type: 'currency' },
      { header: 'Pagado', key: 'montoPagado', type: 'currency' },
      { header: 'Saldo', key: 'saldoPendiente', type: 'currency' },
      { header: 'Estado', key: 'estado', type: 'text', width: 14 },
    ];
    const facturasSheet: WorkbookSheetConfig = {
      name: 'Facturas',
      columns: facturasCols,
      data: data.facturas,
      totalsRow: {
        numero: 'TOTAL',
        montoTotal: data.facturas.reduce((s: number, f: any) => s + (f.montoTotal || 0), 0),
        montoPagado: data.facturas.reduce((s: number, f: any) => s + (f.montoPagado || 0), 0),
        saldoPendiente: data.facturas.reduce((s: number, f: any) => s + (f.saldoPendiente || 0), 0),
      },
    };

    // Sheet 3: Pagos
    const pagosSheet: WorkbookSheetConfig = {
      name: 'Pagos',
      columns: [
        { header: 'Fecha', key: 'fechaPago', type: 'date' },
        { header: 'Factura', key: 'factura.numero', type: 'text', width: 22 },
        { header: 'Monto Base', key: 'montoBase', type: 'currency' },
        { header: 'Monto Neto', key: 'montoNeto', type: 'currency' },
        { header: 'Medio', key: 'medioPago', type: 'text', width: 16 },
        { header: 'Referencia', key: 'referenciaPago', type: 'text', width: 22 },
        { header: 'Estado', key: 'estado', type: 'text', width: 14 },
      ],
      data: data.pagos,
      totalsRow: {
        fechaPago: 'TOTAL',
        montoBase: data.pagos.reduce((s: number, p: any) => s + (p.montoBase || 0), 0),
        montoNeto: data.pagos.reduce((s: number, p: any) => s + (p.montoNeto || 0), 0),
      },
    };

    // Sheet 4: NC / ND
    const ncSheet: WorkbookSheetConfig = {
      name: 'NC-ND',
      columns: [
        { header: 'Número', key: 'numero', type: 'text', width: 22 },
        { header: 'Tipo', key: 'tipo', type: 'text', width: 10 },
        { header: 'Fecha', key: 'fecha', type: 'date' },
        { header: 'Monto', key: 'montoTotal', type: 'currency' },
        { header: 'Factura Original', key: 'facturaRelacionada.numero', type: 'text', width: 22 },
      ],
      data: data.notasCredito,
      totalsRow: {
        numero: 'TOTAL',
        montoTotal: data.notasCredito.reduce((s: number, n: any) => s + (n.montoTotal || 0), 0),
      },
    };

    if (dto.formato === 'csv') {
      // CSV doesn't support multi-sheet — fall back to the facturas sheet only
      const csv = await this.exportService.generateCsv(data.facturas, facturasCols);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=estado-cuenta-${prov.razonSocial.replace(/\s+/g, '_')}.csv`);
      return res.send(csv);
    }

    const buffer = await this.exportService.generateWorkbook({
      title,
      filterSummary,
      sheets: [resumenSheet, facturasSheet, pagosSheet, ncSheet],
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=estado-cuenta-${prov.razonSocial.replace(/\s+/g, '_')}.xlsx`);
    return res.send(buffer);
  }

  @Get('comisiones-descuentos/export')
  @Roles('admin', 'tesoreria', 'operador', 'consulta')
  async exportComisionesDescuentos(@Query() dto: ReporteQueryDto, @Res() res: express.Response) {
    const data = await this.service.getComisionesDescuentos(dto);
    const columns: ExportColumn[] = [
      { header: 'Proveedor', key: 'razonSocial', type: 'text', width: 32 },
      { header: 'Monto Base', key: 'montoBase', type: 'currency' },
      { header: 'Comisión', key: 'comision', type: 'currency' },
      { header: 'Descuento', key: 'descuento', type: 'currency' },
    ];
    const totalsRow = {
      razonSocial: 'TOTAL',
      montoBase: data.porProveedor.reduce((s: number, p: any) => s + (p.montoBase || 0), 0),
      comision: data.porProveedor.reduce((s: number, p: any) => s + (p.comision || 0), 0),
      descuento: data.porProveedor.reduce((s: number, p: any) => s + (p.descuento || 0), 0),
    };
    await this.sendExport(res, data.porProveedor, columns, 'comisiones-descuentos', dto.formato, {
      title: 'Comisiones y Descuentos',
      filterSummary: this.buildDateFilter(dto),
      totalsRow,
    });
  }

  @Get('facturas-vencimiento/export')
  @Roles('admin', 'tesoreria', 'operador', 'consulta')
  async exportFacturasVencimiento(@Query() dto: ReporteQueryDto, @Res() res: express.Response) {
    const data = await this.service.getFacturasVencimiento(dto);
    const columns: ExportColumn[] = [
      { header: 'Bucket', key: 'bucket', type: 'text', width: 18 },
      { header: 'Cantidad', key: 'cantidad', type: 'number' },
      { header: 'Monto Total', key: 'montoTotal', type: 'currency' },
      { header: 'Saldo Pendiente', key: 'saldoPendiente', type: 'currency' },
    ];
    const rows = [...data.vencidas, ...data.porVencer];
    const totalsRow = {
      bucket: 'TOTAL',
      cantidad: rows.reduce((s: number, r: any) => s + (r.cantidad || 0), 0),
      montoTotal: rows.reduce((s: number, r: any) => s + (r.montoTotal || 0), 0),
      saldoPendiente: rows.reduce((s: number, r: any) => s + (r.saldoPendiente || 0), 0),
    };
    await this.sendExport(res, rows, columns, 'facturas-vencimiento', dto.formato, {
      title: 'Facturas — Estado de Vencimiento',
      totalsRow,
    });
  }

  private buildDateFilter(dto: ReporteQueryDto): string | undefined {
    const parts: string[] = [];
    if (dto.desde) parts.push(`Desde: ${dto.desde}`);
    if (dto.hasta) parts.push(`Hasta: ${dto.hasta}`);
    return parts.length ? parts.join(' · ') : undefined;
  }

  // ============ BASE REPORT ENDPOINTS ============

  @Get('pagos-por-periodo')
  @Roles('admin', 'tesoreria', 'operador', 'consulta')
  getPagosPorPeriodo(@Query() dto: ReporteQueryDto) { return this.service.getPagosPorPeriodo(dto); }

  @Get('pagos-por-proveedor')
  @Roles('admin', 'tesoreria', 'operador', 'consulta')
  getPagosPorProveedor(@Query() dto: ReporteQueryDto) { return this.service.getPagosPorProveedor(dto); }

  @Get('facturas-vencimiento')
  @Roles('admin', 'tesoreria', 'operador', 'consulta')
  getFacturasVencimiento(@Query() dto: ReporteQueryDto) { return this.service.getFacturasVencimiento(dto); }

  @Get('retenciones-acumuladas')
  @Roles('admin', 'tesoreria', 'operador', 'consulta')
  getRetencionesAcumuladas(@Query() dto: ReporteQueryDto) { return this.service.getRetencionesAcumuladas(dto); }

  @Get('comisiones-descuentos')
  @Roles('admin', 'tesoreria', 'operador', 'consulta')
  getComisionesDescuentos(@Query() dto: ReporteQueryDto) { return this.service.getComisionesDescuentos(dto); }

  @Get('estado-cuenta-proveedor')
  @Roles('admin', 'tesoreria', 'operador', 'consulta')
  getEstadoCuentaProveedor(@Query() dto: ReporteQueryDto) { return this.service.getEstadoCuentaProveedor(dto); }

  @Get('estado-cuenta-completo/:empresaProveedoraId')
  @Roles('admin', 'tesoreria', 'operador')
  getEstadoCuentaCompleto(@Param('empresaProveedoraId') empresaProveedoraId: string) {
    return this.service.getEstadoCuentaCompleto(empresaProveedoraId);
  }

  @Get('facturas-por-tipo')
  @Roles('admin', 'tesoreria', 'operador', 'consulta')
  getFacturasPorTipo(@Query() dto: ReporteQueryDto) { return this.service.getFacturasPorTipo(dto); }

  // ============ HELPERS ============

  private async sendExport(
    res: express.Response,
    data: any[],
    columns: ExportColumn[],
    filename: string,
    formato = 'xlsx',
    options: { title?: string; filterSummary?: string; totalsRow?: Record<string, string | number> } = {},
  ) {
    try {
      if (formato === 'csv') {
        const csv = await this.exportService.generateCsv(data, columns);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}.csv`);
        res.send(csv);
      } else if (formato === 'pdf') {
        const buffer = await this.exportService.generatePdf(data, columns, options.title ?? filename, {
          filterSummary: options.filterSummary,
          totalsRow: options.totalsRow,
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}.pdf`);
        res.send(buffer);
      } else {
        const buffer = await this.exportService.generateExcel(data, columns, options.title ?? filename, {
          title: options.title ?? filename,
          filterSummary: options.filterSummary,
          totalsRow: options.totalsRow,
        });
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
