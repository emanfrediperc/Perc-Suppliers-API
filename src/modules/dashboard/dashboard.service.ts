import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OrdenPago, OrdenPagoDocument } from '../orden-pago/schemas/orden-pago.schema';
import { Factura, FacturaDocument } from '../factura/schemas/factura.schema';
import { Pago, PagoDocument } from '../pago/schemas/pago.schema';
import { EmpresaProveedora, EmpresaProveedoraDocument } from '../empresa-proveedora/schemas/empresa-proveedora.schema';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(OrdenPago.name) private ordenModel: Model<OrdenPagoDocument>,
    @InjectModel(Factura.name) private facturaModel: Model<FacturaDocument>,
    @InjectModel(Pago.name) private pagoModel: Model<PagoDocument>,
    @InjectModel(EmpresaProveedora.name) private empresaModel: Model<EmpresaProveedoraDocument>,
  ) {}

  async getSummary(dto?: DashboardQueryDto) {
    // Date filter for ordenes/facturas (uses 'fecha' field, with end-of-day for hasta)
    const dateMatch: any = {};
    if (dto?.desde || dto?.hasta) {
      dateMatch.fecha = {};
      if (dto.desde) dateMatch.fecha.$gte = new Date(dto.desde);
      if (dto.hasta) {
        const hastaEnd = new Date(dto.hasta);
        hastaEnd.setHours(23, 59, 59, 999);
        dateMatch.fecha.$lte = hastaEnd;
      }
    }

    // Date filter for pagos (uses 'fechaPago' field)
    const pagoDateMatch: any = {};
    if (dto?.desde || dto?.hasta) {
      pagoDateMatch.fechaPago = {};
      if (dto.desde) pagoDateMatch.fechaPago.$gte = new Date(dto.desde);
      if (dto.hasta) {
        const hastaEnd = new Date(dto.hasta);
        hastaEnd.setHours(23, 59, 59, 999);
        pagoDateMatch.fechaPago.$lte = hastaEnd;
      }
    }

    const [totalOrdenes, ordenesPendientes, totalFacturas, facturasPendientes, totalPagos, totalProveedores] = await Promise.all([
      this.ordenModel.countDocuments(dateMatch), this.ordenModel.countDocuments({ estado: 'pendiente', ...dateMatch }),
      this.facturaModel.countDocuments(dateMatch), this.facturaModel.countDocuments({ estado: { $in: ['pendiente', 'parcial'] }, ...dateMatch }),
      this.pagoModel.countDocuments(pagoDateMatch), this.empresaModel.countDocuments({ activa: true }),
    ]);
    // saldoPendiente should NOT be filtered by date - it's always the current outstanding balance
    const [montoPagadoResult, saldoPendienteResult] = await Promise.all([
      this.pagoModel.aggregate([{ $match: { estado: 'confirmado', ...pagoDateMatch } }, { $group: { _id: null, total: { $sum: '$montoBase' } } }]),
      this.facturaModel.aggregate([{ $match: { estado: { $in: ['pendiente', 'parcial'] } } }, { $group: { _id: null, total: { $sum: '$saldoPendiente' } } }]),
    ]);

    const montoPagado = montoPagadoResult[0]?.total || 0;
    const saldoPendiente = saldoPendienteResult[0]?.total || 0;

    // Calculate trends comparing to previous period of same length
    let trends = { ordenes: 0, facturas: 0, montoPagado: 0, saldoPendiente: 0 };
    if (dto?.desde && dto?.hasta) {
      const desde = new Date(dto.desde);
      const hasta = new Date(dto.hasta);
      const diffMs = hasta.getTime() - desde.getTime();
      const prevDesde = new Date(desde.getTime() - diffMs);
      const prevHasta = new Date(desde);

      const prevDateMatch: any = { fecha: { $gte: prevDesde, $lt: prevHasta } };
      const prevPagoDateMatch: any = { fechaPago: { $gte: prevDesde, $lt: prevHasta } };

      const [prevOrdenes, prevFacturas, prevMontoPagado] = await Promise.all([
        this.ordenModel.countDocuments(prevDateMatch),
        this.facturaModel.countDocuments(prevDateMatch),
        this.pagoModel.aggregate([{ $match: { estado: 'confirmado', ...prevPagoDateMatch } }, { $group: { _id: null, total: { $sum: '$montoBase' } } }]),
      ]);

      const prevMonto = prevMontoPagado[0]?.total || 0;
      trends = {
        ordenes: prevOrdenes ? ((totalOrdenes - prevOrdenes) / prevOrdenes) * 100 : 0,
        facturas: prevFacturas ? ((totalFacturas - prevFacturas) / prevFacturas) * 100 : 0,
        montoPagado: prevMonto ? ((montoPagado - prevMonto) / prevMonto) * 100 : 0,
        saldoPendiente: 0,
      };
    }

    return { totalOrdenes, ordenesPendientes, totalFacturas, facturasPendientes, totalPagos, totalProveedores, montoPagado, saldoPendiente, trends };
  }

  async getRecentActivity() {
    const [recentPagos, recentOrdenes, recentFacturas] = await Promise.all([
      this.pagoModel.find().populate({ path: 'factura', populate: { path: 'empresaProveedora' } }).sort({ createdAt: -1 }).limit(5),
      this.ordenModel.find().populate('empresaProveedora').sort({ createdAt: -1 }).limit(5),
      this.facturaModel.find().populate('empresaProveedora').sort({ createdAt: -1 }).limit(5),
    ]);
    return { recentPagos, recentOrdenes, recentFacturas };
  }

  async getPagosPorMes() {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    return this.pagoModel.aggregate([
      { $match: { estado: 'confirmado', fechaPago: { $gte: twelveMonthsAgo } } },
      {
        $group: {
          _id: { anio: { $year: '$fechaPago' }, mes: { $month: '$fechaPago' } },
          montoTotal: { $sum: '$montoBase' },
          cantidad: { $sum: 1 },
        },
      },
      { $sort: { '_id.anio': 1, '_id.mes': 1 } },
      {
        $project: {
          _id: 0,
          periodo: { $concat: [{ $toString: '$_id.mes' }, '/', { $toString: '$_id.anio' }] },
          montoTotal: 1, cantidad: 1,
        },
      },
    ]);
  }

  async getFacturasPorEstado() {
    return this.facturaModel.aggregate([
      {
        $group: {
          _id: '$estado',
          cantidad: { $sum: 1 },
          montoTotal: { $sum: '$montoTotal' },
        },
      },
      { $project: { _id: 0, estado: '$_id', cantidad: 1, montoTotal: 1 } },
      { $sort: { cantidad: -1 } },
    ]);
  }

  async getTopProveedores(dto?: DashboardQueryDto) {
    const dateMatch: any = { estado: 'confirmado' };
    if (dto?.desde || dto?.hasta) {
      dateMatch.fechaPago = {};
      if (dto.desde) dateMatch.fechaPago.$gte = new Date(dto.desde);
      if (dto.hasta) dateMatch.fechaPago.$lte = new Date(dto.hasta);
    }

    return this.pagoModel.aggregate([
      { $match: dateMatch },
      { $lookup: { from: 'facturas', localField: 'factura', foreignField: '_id', as: 'facturaData' } },
      { $unwind: '$facturaData' },
      { $lookup: { from: 'empresas_proveedoras', localField: 'facturaData.empresaProveedora', foreignField: '_id', as: 'proveedorData' } },
      { $unwind: '$proveedorData' },
      {
        $group: {
          _id: '$proveedorData._id',
          razonSocial: { $first: '$proveedorData.razonSocial' },
          montoTotal: { $sum: '$montoBase' },
          cantidadPagos: { $sum: 1 },
        },
      },
      { $sort: { montoTotal: -1 } },
      { $limit: 5 },
      { $project: { _id: 0, proveedor: { _id: '$_id', razonSocial: '$razonSocial' }, montoTotal: 1, cantidadPagos: 1 } },
    ]);
  }

  async getFacturasPorVencer() {
    const now = new Date();
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

    return this.facturaModel
      .find({
        estado: { $in: ['pendiente', 'parcial'] },
        fechaVencimiento: { $gte: now, $lte: thirtyDaysLater },
      })
      .populate('empresaProveedora')
      .sort({ fechaVencimiento: 1 })
      .limit(10)
      .select('numero fechaVencimiento montoTotal saldoPendiente empresaProveedora');
  }
}
