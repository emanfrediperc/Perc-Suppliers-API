import { Injectable, NotFoundException, BadRequestException, Inject, Logger } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import { OrdenPago, OrdenPagoDocument } from './schemas/orden-pago.schema';
import { Factura, FacturaDocument } from '../factura/schemas/factura.schema';
import { Pago, PagoDocument } from '../pago/schemas/pago.schema';
import { Convenio, ConvenioDocument } from '../convenio/schemas/convenio.schema';
import { EmpresaProveedora, EmpresaProveedoraDocument } from '../empresa-proveedora/schemas/empresa-proveedora.schema';
import { EmpresaCliente, EmpresaClienteDocument } from '../empresa-cliente/schemas/empresa-cliente.schema';
import { CreateOrdenPagoDto } from './dto/create-orden-pago.dto';
import { UpdateOrdenPagoDto } from './dto/update-orden-pago.dto';
import { PagarOrdenDto } from './dto/pagar-orden.dto';
import { PagoLoteItemDto } from './dto/pagar-lote.dto';
import { OrdenPagoQueryDto } from './dto/orden-pago-query.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { escapeRegex } from '../../common/utils/escape-regex';
import { IFinnegansService } from '../../integrations/finnegans/finnegans.interface';
import { PagoCalculatorService } from '../../common/services/pago-calculator.service';

@Injectable()
export class OrdenPagoService {
  private readonly logger = new Logger(OrdenPagoService.name);

  constructor(
    @InjectModel(OrdenPago.name) private ordenModel: Model<OrdenPagoDocument>,
    @InjectModel(Factura.name) private facturaModel: Model<FacturaDocument>,
    @InjectModel(Pago.name) private pagoModel: Model<PagoDocument>,
    @InjectModel(Convenio.name) private convenioModel: Model<ConvenioDocument>,
    @InjectModel(EmpresaProveedora.name) private empresaProvModel: Model<EmpresaProveedoraDocument>,
    @InjectModel(EmpresaCliente.name) private empresaCliModel: Model<EmpresaClienteDocument>,
    @Inject('FINNEGANS_SERVICE') private finnegansService: IFinnegansService,
    @InjectConnection() private connection: Connection,
    private pagoCalculator: PagoCalculatorService,
  ) {}

  async create(dto: CreateOrdenPagoDto): Promise<OrdenPagoDocument> { return this.ordenModel.create(dto); }

  async findAll(query: OrdenPagoQueryDto): Promise<PaginatedResponseDto<OrdenPagoDocument>> {
    const { page, limit, search, sortBy, sortOrder, empresaProveedora, empresaCliente, estado, fechaDesde, fechaHasta } = query;
    const filter: any = { activo: { $ne: false } };
    if (search) { const escaped = escapeRegex(search); filter.$or = [{ numero: { $regex: escaped, $options: 'i' } }]; }
    if (empresaProveedora) { filter.empresaProveedora = new Types.ObjectId(empresaProveedora); }
    if (estado) { filter.estado = estado; }
    if (fechaDesde || fechaHasta) {
      filter.fecha = {};
      if (fechaDesde) filter.fecha.$gte = new Date(fechaDesde);
      if (fechaHasta) { const h = new Date(fechaHasta); h.setHours(23, 59, 59, 999); filter.fecha.$lte = h; }
    }
    if (empresaCliente) {
      const facturaIds = await this.facturaModel.find({ empresaCliente: new Types.ObjectId(empresaCliente) }).distinct('_id');
      filter.facturas = { $in: facturaIds };
    }
    const sort: any = sortBy ? { [sortBy]: sortOrder === 'asc' ? 1 : -1 } : { fecha: -1 };
    const [data, total] = await Promise.all([
      this.ordenModel.find(filter).populate('empresaProveedora').populate({ path: 'facturas', populate: { path: 'empresaCliente' } }).sort(sort).skip((page - 1) * limit).limit(limit),
      this.ordenModel.countDocuments(filter),
    ]);
    return new PaginatedResponseDto(data, total, page, limit);
  }

  async findOne(id: string): Promise<OrdenPagoDocument> {
    const orden = await this.ordenModel.findById(id)
      .populate('empresaProveedora')
      .populate({ path: 'facturas', populate: [{ path: 'empresaProveedora' }, { path: 'empresaCliente' }] })
      .populate({ path: 'pagos', populate: [{ path: 'convenioAplicado' }, { path: 'factura' }] });
    if (!orden) throw new NotFoundException('Orden de pago no encontrada');
    return orden;
  }

  async update(id: string, dto: UpdateOrdenPagoDto): Promise<OrdenPagoDocument> {
    const orden = await this.ordenModel.findByIdAndUpdate(id, dto, { new: true });
    if (!orden) throw new NotFoundException('Orden de pago no encontrada');
    return orden;
  }

  async deactivate(id: string): Promise<OrdenPagoDocument> {
    const orden = await this.ordenModel.findById(id);
    if (!orden) throw new NotFoundException('Orden de pago no encontrada');
    if (orden.estado === 'pagada') throw new BadRequestException('No se puede desactivar una orden pagada');
    orden.activo = false;
    await orden.save();
    return orden;
  }

  async pagar(ordenId: string, dto: PagarOrdenDto) {
    const orden = await this.ordenModel.findById(ordenId).populate('empresaProveedora').populate('facturas');
    if (!orden) throw new NotFoundException('Orden de pago no encontrada');
    if (orden.estado === 'pagada') throw new BadRequestException('La orden ya esta completamente pagada');

    const saldoPendiente = orden.montoTotal - (orden.montoPagado || 0);
    if (dto.montoBase > saldoPendiente) {
      throw new BadRequestException(`El monto ($${dto.montoBase}) excede el saldo pendiente ($${saldoPendiente})`);
    }

    // Buscar convenio del proveedor
    const convenio = await this.convenioModel.findOne({ empresasProveedoras: orden.empresaProveedora._id, activo: true });
    const calc = this.pagoCalculator.calculate(dto.montoBase, dto, convenio);

    const pagoData: any = {
      ordenPago: orden._id,
      fechaPago: dto.fechaPago ? new Date(dto.fechaPago) : new Date(),
      montoBase: dto.montoBase,
      retencionIIBB: dto.retencionIIBB || 0,
      retencionGanancias: dto.retencionGanancias || 0,
      retencionIVA: dto.retencionIVA || 0,
      retencionSUSS: dto.retencionSUSS || 0,
      otrasRetenciones: dto.otrasRetenciones || 0,
      ...calc,
      medioPago: dto.medioPago,
      referenciaPago: dto.referenciaPago,
      observaciones: dto.observaciones,
      estado: 'confirmado',
    };
    if (convenio) pagoData.convenioAplicado = convenio._id;

    // Use transaction for data integrity across Pago, Factura, and OrdenPago
    const session = await this.connection.startSession();
    try {
      session.startTransaction();

      const [pago] = await this.pagoModel.create([pagoData], { session });

      // Actualizar montos de la orden
      orden.montoPagado = (orden.montoPagado || 0) + dto.montoBase;
      orden.saldoPendiente = orden.montoTotal - orden.montoPagado;
      (orden.pagos as any[]).push(pago._id);
      orden.estado = orden.saldoPendiente <= 0 ? 'pagada' : 'parcial';
      if (orden.saldoPendiente < 0) orden.saldoPendiente = 0;
      await orden.save({ session });

      // Distribuir pago entre facturas pendientes de la orden (por antigüedad)
      let restante = dto.montoBase;
      const facturasPendientes = (orden.facturas as any[])
        .filter((f: any) => f.estado !== 'pagada' && f.estado !== 'anulada')
        .sort((a: any, b: any) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

      for (const factura of facturasPendientes) {
        if (restante <= 0) break;
        const aplicar = Math.min(restante, factura.saldoPendiente);
        factura.montoPagado += aplicar;
        factura.saldoPendiente = factura.montoTotal - factura.montoPagado;
        if (factura.saldoPendiente <= 0) {
          factura.saldoPendiente = 0;
          factura.estado = 'pagada';
        } else {
          factura.estado = 'parcial';
        }
        (factura.pagos as any[]).push(pago._id);
        await factura.save({ session });
        restante -= aplicar;
      }

      await session.commitTransaction();
      this.logger.log(`Pago ${pago._id} creado para orden ${orden.numero} - Monto: ${dto.montoBase}`);
      return this.pagoModel.findById(pago._id).populate('convenioAplicado');
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async pagarLote(items: PagoLoteItemDto[]): Promise<{ resultados: Array<{ ordenId: string; exito: boolean; pagoId?: string; error?: string }> }> {
    const resultados: Array<{ ordenId: string; exito: boolean; pagoId?: string; error?: string }> = [];
    for (const item of items) {
      try {
        const dto: PagarOrdenDto = {
          montoBase: item.montoBase,
          medioPago: item.medioPago,
          fechaPago: item.fechaPago,
          retencionIIBB: item.retencionIIBB,
          retencionGanancias: item.retencionGanancias,
          retencionIVA: item.retencionIVA,
          retencionSUSS: item.retencionSUSS,
          otrasRetenciones: item.otrasRetenciones,
          referenciaPago: item.referenciaPago,
          observaciones: item.observaciones,
        };
        const pago = await this.pagar(item.ordenId, dto);
        resultados.push({ ordenId: item.ordenId, exito: true, pagoId: (pago as any)?._id?.toString() });
      } catch (error: any) {
        resultados.push({ ordenId: item.ordenId, exito: false, error: error.message || 'Error desconocido' });
      }
    }
    return { resultados };
  }

  async syncFromFinnegans(): Promise<{ created: number; updated: number }> {
    const ordenes = await this.finnegansService.getOrdenesDePageFromERP();
    let created = 0, updated = 0;
    for (const od of ordenes) {
      let ep = await this.empresaProvModel.findOne({ cuit: od.empresaCuit });
      if (!ep) { ep = await this.empresaProvModel.create({ cuit: od.empresaCuit, razonSocial: `Proveedor ${od.empresaCuit}`, finnegansId: `FIN-AUTO-${od.empresaCuit}` }); }
      let orden = await this.ordenModel.findOne({ finnegansId: od.finnegansId });
      if (!orden) {
        orden = await this.ordenModel.create({ numero: od.numero, finnegansId: od.finnegansId, fecha: od.fecha, empresaProveedora: ep._id, montoTotal: od.montoTotal, moneda: od.moneda, estado: 'pendiente', saldoPendiente: od.montoTotal });
        created++;
      } else { updated++; }
      for (const fd of od.facturas) {
        let ec = await this.empresaCliModel.findOne({ cuit: fd.empresaClienteCuit });
        if (!ec) { ec = await this.empresaCliModel.create({ cuit: fd.empresaClienteCuit, razonSocial: `Cliente ${fd.empresaClienteCuit}` }); }
        let f = await this.facturaModel.findOne({ finnegansId: fd.finnegansId });
        if (!f) {
          f = await this.facturaModel.create({ numero: fd.numero, finnegansId: fd.finnegansId, tipo: fd.tipo, fecha: fd.fecha, fechaVencimiento: fd.fechaVencimiento, montoNeto: fd.montoNeto, montoIva: fd.montoIva, montoTotal: fd.montoTotal, moneda: fd.moneda, empresaProveedora: ep._id, empresaCliente: ec._id, ordenPago: orden._id, estado: 'pendiente', montoPagado: 0, saldoPendiente: fd.montoTotal });
          orden.facturas.push(f._id);
        }
      }
      await orden.save();
    }
    return { created, updated };
  }
}
