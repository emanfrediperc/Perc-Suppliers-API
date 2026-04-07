import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Pago, PagoDocument } from '../pago/schemas/pago.schema';
import { Factura, FacturaDocument } from '../factura/schemas/factura.schema';
import { OrdenPago, OrdenPagoDocument } from '../orden-pago/schemas/orden-pago.schema';
import { EmpresaProveedora, EmpresaProveedoraDocument } from '../empresa-proveedora/schemas/empresa-proveedora.schema';
import { Convenio, ConvenioDocument } from '../convenio/schemas/convenio.schema';
import { ReporteQueryDto } from './dto/reporte-query.dto';

@Injectable()
export class ReporteService {
  constructor(
    @InjectModel(Pago.name) private pagoModel: Model<PagoDocument>,
    @InjectModel(Factura.name) private facturaModel: Model<FacturaDocument>,
    @InjectModel(OrdenPago.name) private ordenModel: Model<OrdenPagoDocument>,
    @InjectModel(EmpresaProveedora.name) private empresaModel: Model<EmpresaProveedoraDocument>,
    @InjectModel(Convenio.name) private convenioModel: Model<ConvenioDocument>,
  ) {}

  private buildDateMatch(dto: ReporteQueryDto, field = 'fechaPago') {
    const match: any = {};
    if (dto.desde || dto.hasta) {
      match[field] = {};
      if (dto.desde) match[field].$gte = new Date(dto.desde);
      if (dto.hasta) match[field].$lte = new Date(dto.hasta);
    }
    return match;
  }

  async getPagosPorPeriodo(dto: ReporteQueryDto) {
    const dateMatch = this.buildDateMatch(dto);
    const periodos = await this.pagoModel.aggregate([
      { $match: { estado: 'confirmado', ...dateMatch } },
      {
        $group: {
          _id: { anio: { $year: '$fechaPago' }, mes: { $month: '$fechaPago' } },
          montoBase: { $sum: '$montoBase' },
          montoNeto: { $sum: '$montoNeto' },
          retencionIIBB: { $sum: '$retencionIIBB' },
          retencionGanancias: { $sum: '$retencionGanancias' },
          retencionIVA: { $sum: '$retencionIVA' },
          retencionSUSS: { $sum: '$retencionSUSS' },
          otrasRetenciones: { $sum: '$otrasRetenciones' },
          comision: { $sum: '$comision' },
          descuento: { $sum: '$descuento' },
          cantidad: { $sum: 1 },
        },
      },
      { $sort: { '_id.anio': -1, '_id.mes': -1 } },
      {
        $project: {
          _id: 0, anio: '$_id.anio', mes: '$_id.mes',
          periodo: { $concat: [{ $toString: '$_id.mes' }, '/', { $toString: '$_id.anio' }] },
          montoBase: 1, montoNeto: 1, retencionIIBB: 1, retencionGanancias: 1,
          retencionIVA: 1, retencionSUSS: 1, otrasRetenciones: 1, comision: 1, descuento: 1, cantidad: 1,
        },
      },
    ]);

    const totales = periodos.reduce(
      (acc, p) => ({
        montoBase: acc.montoBase + p.montoBase,
        montoNeto: acc.montoNeto + p.montoNeto,
        retenciones: acc.retenciones + p.retencionIIBB + p.retencionGanancias + p.retencionIVA + p.retencionSUSS + p.otrasRetenciones,
        comision: acc.comision + p.comision,
        descuento: acc.descuento + p.descuento,
        cantidad: acc.cantidad + p.cantidad,
      }),
      { montoBase: 0, montoNeto: 0, retenciones: 0, comision: 0, descuento: 0, cantidad: 0 },
    );

    return { periodos, totales };
  }

  async getPagosPorProveedor(dto: ReporteQueryDto) {
    const dateMatch = this.buildDateMatch(dto);
    const proveedores = await this.pagoModel.aggregate([
      { $match: { estado: 'confirmado', ...dateMatch } },
      { $lookup: { from: 'facturas', localField: 'factura', foreignField: '_id', as: 'facturaData' } },
      { $unwind: '$facturaData' },
      { $lookup: { from: 'empresas_proveedoras', localField: 'facturaData.empresaProveedora', foreignField: '_id', as: 'proveedorData' } },
      { $unwind: '$proveedorData' },
      {
        $group: {
          _id: '$proveedorData._id',
          razonSocial: { $first: '$proveedorData.razonSocial' },
          montoBase: { $sum: '$montoBase' },
          montoNeto: { $sum: '$montoNeto' },
          cantidadPagos: { $sum: 1 },
        },
      },
      { $sort: { montoBase: -1 } },
      { $project: { _id: 0, proveedorId: '$_id', razonSocial: 1, montoBase: 1, montoNeto: 1, cantidadPagos: 1 } },
    ]);
    return { proveedores };
  }

  async getFacturasVencimiento(dto: ReporteQueryDto) {
    const now = new Date();
    const baseMatch: any = { estado: { $in: ['pendiente', 'parcial'] } };
    if (dto.empresaProveedora) baseMatch.empresaProveedora = new Types.ObjectId(dto.empresaProveedora);

    // Vencidas
    const vencidas = await this.facturaModel.aggregate([
      { $match: { ...baseMatch, fechaVencimiento: { $lt: now } } },
      {
        $addFields: {
          diasVencida: { $dateDiff: { startDate: '$fechaVencimiento', endDate: now, unit: 'day' } },
        },
      },
      {
        $bucket: {
          groupBy: '$diasVencida',
          boundaries: [0, 31, 61, 91],
          default: '90+',
          output: { cantidad: { $sum: 1 }, montoTotal: { $sum: '$montoTotal' }, saldoPendiente: { $sum: '$saldoPendiente' } },
        },
      },
    ]);

    const bucketLabels: Record<string, string> = { 0: '0-30 dias', 31: '31-60 dias', 61: '61-90 dias', '90+': '90+ dias' };
    const vencidasFormatted = vencidas.map((v) => ({
      bucket: bucketLabels[String(v._id)] || `${v._id} dias`,
      cantidad: v.cantidad,
      montoTotal: v.montoTotal,
      saldoPendiente: v.saldoPendiente,
    }));

    // Por vencer
    const porVencer = await this.facturaModel.aggregate([
      { $match: { ...baseMatch, fechaVencimiento: { $gte: now } } },
      {
        $addFields: {
          diasParaVencer: { $dateDiff: { startDate: now, endDate: '$fechaVencimiento', unit: 'day' } },
        },
      },
      {
        $bucket: {
          groupBy: '$diasParaVencer',
          boundaries: [0, 31, 61, 91],
          default: '90+',
          output: { cantidad: { $sum: 1 }, montoTotal: { $sum: '$montoTotal' }, saldoPendiente: { $sum: '$saldoPendiente' } },
        },
      },
    ]);

    const porVencerLabels: Record<string, string> = { 0: 'Proximos 30 dias', 31: '31-60 dias', 61: '61-90 dias', '90+': '90+ dias' };
    const porVencerFormatted = porVencer.map((v) => ({
      bucket: porVencerLabels[String(v._id)] || `${v._id} dias`,
      cantidad: v.cantidad,
      montoTotal: v.montoTotal,
      saldoPendiente: v.saldoPendiente,
    }));

    return { vencidas: vencidasFormatted, porVencer: porVencerFormatted };
  }

  async getRetencionesAcumuladas(dto: ReporteQueryDto) {
    const dateMatch = this.buildDateMatch(dto);
    const periodos = await this.pagoModel.aggregate([
      { $match: { estado: 'confirmado', ...dateMatch } },
      {
        $group: {
          _id: { anio: { $year: '$fechaPago' }, mes: { $month: '$fechaPago' } },
          retencionIIBB: { $sum: '$retencionIIBB' },
          retencionGanancias: { $sum: '$retencionGanancias' },
          retencionIVA: { $sum: '$retencionIVA' },
          retencionSUSS: { $sum: '$retencionSUSS' },
          otrasRetenciones: { $sum: '$otrasRetenciones' },
        },
      },
      { $sort: { '_id.anio': -1, '_id.mes': -1 } },
      {
        $project: {
          _id: 0, anio: '$_id.anio', mes: '$_id.mes',
          periodo: { $concat: [{ $toString: '$_id.mes' }, '/', { $toString: '$_id.anio' }] },
          retencionIIBB: 1, retencionGanancias: 1, retencionIVA: 1, retencionSUSS: 1, otrasRetenciones: 1,
          total: { $add: ['$retencionIIBB', '$retencionGanancias', '$retencionIVA', '$retencionSUSS', '$otrasRetenciones'] },
        },
      },
    ]);

    const totales = periodos.reduce(
      (acc, p) => ({
        retencionIIBB: acc.retencionIIBB + p.retencionIIBB,
        retencionGanancias: acc.retencionGanancias + p.retencionGanancias,
        retencionIVA: acc.retencionIVA + p.retencionIVA,
        retencionSUSS: acc.retencionSUSS + p.retencionSUSS,
        otrasRetenciones: acc.otrasRetenciones + p.otrasRetenciones,
        total: acc.total + p.total,
      }),
      { retencionIIBB: 0, retencionGanancias: 0, retencionIVA: 0, retencionSUSS: 0, otrasRetenciones: 0, total: 0 },
    );

    return { periodos, totales };
  }

  async getComisionesDescuentos(dto: ReporteQueryDto) {
    const dateMatch = this.buildDateMatch(dto);

    const porConvenio = await this.pagoModel.aggregate([
      { $match: { estado: 'confirmado', convenioAplicado: { $ne: null }, ...dateMatch } },
      { $lookup: { from: 'convenios', localField: 'convenioAplicado', foreignField: '_id', as: 'convenioData' } },
      { $unwind: '$convenioData' },
      {
        $group: {
          _id: '$convenioData._id',
          nombre: { $first: '$convenioData.nombre' },
          comision: { $sum: '$comision' },
          descuento: { $sum: '$descuento' },
          montoBase: { $sum: '$montoBase' },
          cantidad: { $sum: 1 },
        },
      },
      { $sort: { comision: -1 } },
      { $project: { _id: 0, convenioId: '$_id', nombre: 1, comision: 1, descuento: 1, montoBase: 1, cantidad: 1 } },
    ]);

    const porProveedor = await this.pagoModel.aggregate([
      { $match: { estado: 'confirmado', ...dateMatch } },
      { $lookup: { from: 'facturas', localField: 'factura', foreignField: '_id', as: 'facturaData' } },
      { $unwind: '$facturaData' },
      { $lookup: { from: 'empresas_proveedoras', localField: 'facturaData.empresaProveedora', foreignField: '_id', as: 'proveedorData' } },
      { $unwind: '$proveedorData' },
      {
        $group: {
          _id: '$proveedorData._id',
          razonSocial: { $first: '$proveedorData.razonSocial' },
          comision: { $sum: '$comision' },
          descuento: { $sum: '$descuento' },
          montoBase: { $sum: '$montoBase' },
        },
      },
      { $sort: { comision: -1 } },
      { $project: { _id: 0, proveedorId: '$_id', razonSocial: 1, comision: 1, descuento: 1, montoBase: 1 } },
    ]);

    return { porConvenio, porProveedor };
  }

  async getEstadoCuentaProveedor(dto: ReporteQueryDto) {
    if (!dto.empresaProveedora) return { proveedor: null, facturas: [], totales: { facturado: 0, pagado: 0, saldoPendiente: 0 } };

    const proveedor = await this.empresaModel.findById(dto.empresaProveedora);
    if (!proveedor) return { proveedor: null, facturas: [], totales: { facturado: 0, pagado: 0, saldoPendiente: 0 } };

    const dateMatch: any = {};
    if (dto.desde || dto.hasta) {
      dateMatch.fecha = {};
      if (dto.desde) dateMatch.fecha.$gte = new Date(dto.desde);
      if (dto.hasta) dateMatch.fecha.$lte = new Date(dto.hasta);
    }

    const facturas = await this.facturaModel
      .find({ empresaProveedora: proveedor._id, ...dateMatch })
      .populate('pagos')
      .sort({ fecha: -1 });

    const totales = facturas.reduce(
      (acc, f) => ({
        facturado: acc.facturado + f.montoTotal,
        pagado: acc.pagado + f.montoPagado,
        saldoPendiente: acc.saldoPendiente + (f.saldoPendiente || 0),
      }),
      { facturado: 0, pagado: 0, saldoPendiente: 0 },
    );

    return { proveedor, facturas, totales };
  }

  async getEstadoCuentaCompleto(empresaProveedoraId: string) {
    const proveedor = await this.empresaModel.findById(empresaProveedoraId);
    if (!proveedor) return { proveedor: null, facturas: [], pagos: [], notasCredito: [], totales: { facturado: 0, pagado: 0, saldoPendiente: 0, totalNC: 0 } };

    // Find all facturas for this proveedor
    const allFacturas = await this.facturaModel
      .find({ empresaProveedora: proveedor._id })
      .populate('empresaCliente')
      .populate('facturaRelacionada', 'numero')
      .sort({ fecha: -1 });

    // Separate regular facturas from NC/ND
    const facturas = allFacturas
      .filter(f => !f.tipo.startsWith('NC-') && !f.tipo.startsWith('ND-'))
      .map(f => ({
        _id: f._id,
        numero: f.numero,
        tipo: f.tipo,
        fecha: f.fecha,
        fechaVencimiento: f.fechaVencimiento,
        montoTotal: f.montoTotal,
        montoPagado: f.montoPagado,
        saldoPendiente: f.saldoPendiente || 0,
        estado: f.estado,
        empresaCliente: f.empresaCliente,
      }));

    const notasCredito = allFacturas
      .filter(f => f.tipo.startsWith('NC-') || f.tipo.startsWith('ND-'))
      .map(f => ({
        _id: f._id,
        numero: f.numero,
        tipo: f.tipo,
        fecha: f.fecha,
        montoTotal: f.montoTotal,
        facturaRelacionada: f.facturaRelacionada ? { numero: (f.facturaRelacionada as any).numero } : null,
      }));

    // Find all pagos linked to those facturas
    const facturaIds = allFacturas.map(f => f._id);
    const pagos = await this.pagoModel
      .find({ factura: { $in: facturaIds } })
      .populate('factura', 'numero')
      .sort({ fechaPago: -1 });

    const pagosFormatted = pagos.map(p => ({
      _id: p._id,
      fechaPago: p.fechaPago,
      montoBase: p.montoBase,
      montoNeto: p.montoNeto,
      medioPago: p.medioPago,
      referenciaPago: p.referenciaPago,
      estado: p.estado,
      factura: p.factura ? { numero: (p.factura as any).numero } : null,
    }));

    // Calculate totals (only regular facturas, not NC/ND)
    const facturado = facturas.reduce((sum, f) => sum + f.montoTotal, 0);
    const pagado = facturas.reduce((sum, f) => sum + f.montoPagado, 0);
    const saldoPendiente = facturas.reduce((sum, f) => sum + (f.saldoPendiente || 0), 0);
    const totalNC = notasCredito.reduce((sum, nc) => sum + nc.montoTotal, 0);

    return {
      proveedor: {
        _id: proveedor._id,
        razonSocial: proveedor.razonSocial,
        cuit: proveedor.cuit,
        condicionIva: proveedor.condicionIva,
        direccion: proveedor.direccion,
        telefono: proveedor.telefono,
        email: proveedor.email,
        datosBancarios: proveedor.datosBancarios,
      },
      facturas,
      pagos: pagosFormatted,
      notasCredito,
      totales: { facturado, pagado, saldoPendiente, totalNC },
    };
  }

  async getFacturasPorTipo(dto: ReporteQueryDto) {
    const dateMatch: any = {};
    if (dto.desde || dto.hasta) {
      dateMatch.fecha = {};
      if (dto.desde) dateMatch.fecha.$gte = new Date(dto.desde);
      if (dto.hasta) dateMatch.fecha.$lte = new Date(dto.hasta);
    }
    if (dto.empresaProveedora) dateMatch.empresaProveedora = new Types.ObjectId(dto.empresaProveedora);

    const tipos = await this.facturaModel.aggregate([
      { $match: dateMatch },
      {
        $group: {
          _id: '$tipo',
          cantidad: { $sum: 1 },
          montoTotal: { $sum: '$montoTotal' },
          montoNeto: { $sum: '$montoNeto' },
          montoIva: { $sum: '$montoIva' },
        },
      },
      { $sort: { cantidad: -1 } },
      { $project: { _id: 0, tipo: '$_id', cantidad: 1, montoTotal: 1, montoNeto: 1, montoIva: 1 } },
    ]);

    return { tipos };
  }
}
