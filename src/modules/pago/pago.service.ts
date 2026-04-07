import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection } from 'mongoose';
import { Pago, PagoDocument } from './schemas/pago.schema';
import { Factura, FacturaDocument } from '../factura/schemas/factura.schema';
import { OrdenPago, OrdenPagoDocument } from '../orden-pago/schemas/orden-pago.schema';
import { CreatePagoDto } from './dto/create-pago.dto';
import { UpdatePagoDto } from './dto/update-pago.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';

@Injectable()
export class PagoService {
  constructor(
    @InjectModel(Pago.name) private pagoModel: Model<PagoDocument>,
    @InjectModel(Factura.name) private facturaModel: Model<FacturaDocument>,
    @InjectModel(OrdenPago.name) private ordenModel: Model<OrdenPagoDocument>,
    @InjectConnection() private connection: Connection,
  ) {}

  async create(dto: CreatePagoDto): Promise<PagoDocument> { return this.pagoModel.create(dto); }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResponseDto<PagoDocument>> {
    const { page, limit, sortBy, sortOrder } = query;
    const sort: any = sortBy ? { [sortBy]: sortOrder === 'asc' ? 1 : -1 } : { fechaPago: -1 };
    const [data, total] = await Promise.all([
      this.pagoModel.find().populate({ path: 'factura', populate: { path: 'empresaProveedora' } }).populate('convenioAplicado').sort(sort).skip((page - 1) * limit).limit(limit),
      this.pagoModel.countDocuments(),
    ]);
    return new PaginatedResponseDto(data, total, page, limit);
  }

  async findOne(id: string): Promise<PagoDocument> {
    const pago = await this.pagoModel.findById(id).populate({ path: 'factura', populate: [{ path: 'empresaProveedora' }, { path: 'empresaCliente' }] }).populate('convenioAplicado');
    if (!pago) throw new NotFoundException('Pago no encontrado');
    return pago;
  }

  async update(id: string, dto: UpdatePagoDto): Promise<PagoDocument> {
    const pago = await this.pagoModel.findByIdAndUpdate(id, dto, { new: true });
    if (!pago) throw new NotFoundException('Pago no encontrado');
    return pago;
  }

  async anular(id: string): Promise<PagoDocument> {
    const pago = await this.pagoModel.findById(id);
    if (!pago) throw new NotFoundException('Pago no encontrado');
    if (pago.estado === 'anulado') throw new BadRequestException('El pago ya esta anulado');

    const session = await this.connection.startSession();
    try {
      session.startTransaction();

      pago.estado = 'anulado';
      await pago.save({ session });

      // Recalculate factura amounts from non-anulado pagos
      const factura = await this.facturaModel.findById(pago.factura);
      if (factura) {
        const pagosActivos = await this.pagoModel.find({ factura: factura._id, estado: { $ne: 'anulado' } });
        const montoPagado = pagosActivos.reduce((sum, p) => sum + p.montoBase, 0);
        factura.montoPagado = montoPagado;
        factura.saldoPendiente = factura.montoTotal - montoPagado;
        if (factura.saldoPendiente < 0) factura.saldoPendiente = 0;
        if (factura.saldoPendiente <= 0) factura.estado = 'pagada';
        else if (montoPagado > 0) factura.estado = 'parcial';
        else factura.estado = 'pendiente';
        await factura.save({ session });

        // Propagate state and amount changes to ordenPago
        if (factura.ordenPago) {
          const orden = await this.ordenModel.findById(factura.ordenPago).populate('facturas');
          if (orden) {
            const pagosActivosOrden = await this.pagoModel.find({ ordenPago: orden._id, estado: { $ne: 'anulado' } });
            orden.montoPagado = pagosActivosOrden.reduce((sum, p) => sum + p.montoBase, 0);
            orden.saldoPendiente = Math.max(0, orden.montoTotal - orden.montoPagado);

            const allPaid = (orden.facturas as any[]).every((f: any) => f.estado === 'pagada');
            const anyPaid = (orden.facturas as any[]).some((f: any) => f.estado === 'pagada' || f.estado === 'parcial');
            if (allPaid && orden.montoPagado > 0) orden.estado = 'pagada';
            else if (anyPaid) orden.estado = 'parcial';
            else orden.estado = 'pendiente';
            await orden.save({ session });
          }
        }
      }

      await session.commitTransaction();
      return (await this.pagoModel.findById(pago._id).populate('convenioAplicado'))!;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async generateComprobante(id: string): Promise<Buffer> {
    const pago = await this.pagoModel.findById(id)
      .populate({ path: 'factura', populate: [{ path: 'empresaProveedora' }, { path: 'empresaCliente' }] })
      .populate({ path: 'ordenPago', populate: [{ path: 'empresaProveedora' }, { path: 'facturas', populate: { path: 'empresaCliente' } }] })
      .populate('convenioAplicado');
    if (!pago) throw new NotFoundException('Pago no encontrado');

    const PDFDocument = require('pdfkit');
    return new Promise((resolve) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const buffers: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      const factura = pago.factura as any;
      const orden = pago.ordenPago as any;
      const proveedor = factura?.empresaProveedora || orden?.empresaProveedora;
      const cliente = factura?.empresaCliente || orden?.facturas?.[0]?.empresaCliente;
      const convenio = pago.convenioAplicado as any;
      const fmt = (n: number) => `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      // Header
      doc.fontSize(20).font('Helvetica-Bold').text('COMPROBANTE DE PAGO', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica').fillColor('#666').text(`Fecha de emision: ${new Date().toLocaleDateString('es-AR')}`, { align: 'center' });
      doc.moveDown(1.5);

      // Datos del Proveedor
      doc.fillColor('#000').fontSize(12).font('Helvetica-Bold').text('Datos del Proveedor');
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ccc');
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');
      if (proveedor) {
        doc.text(`Razon Social: ${proveedor.razonSocial || '-'}`);
        doc.text(`CUIT: ${proveedor.cuit || '-'}`);
        if (proveedor.condicionIva) doc.text(`Condicion IVA: ${proveedor.condicionIva}`);
        if (proveedor.direccion) doc.text(`Direccion: ${proveedor.direccion}`);
        if (proveedor.telefono) doc.text(`Telefono: ${proveedor.telefono}`);
        if (proveedor.email) doc.text(`Email: ${proveedor.email}`);
        if (proveedor.datosBancarios) {
          const db = proveedor.datosBancarios;
          if (db.banco) doc.text(`Banco: ${db.banco}`);
          if (db.cbu) doc.text(`CBU: ${db.cbu}`);
          if (db.alias) doc.text(`Alias: ${db.alias}`);
        }
      } else {
        doc.text('-');
      }
      doc.moveDown(1);

      // Datos del Cliente
      doc.fontSize(12).font('Helvetica-Bold').text('Datos del Cliente');
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ccc');
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');
      if (cliente) {
        doc.text(`Razon Social: ${cliente.razonSocial || '-'}`);
        doc.text(`CUIT: ${cliente.cuit || '-'}`);
        if (cliente.condicionIva) doc.text(`Condicion IVA: ${cliente.condicionIva}`);
        if (cliente.direccion) doc.text(`Direccion: ${cliente.direccion}`);
        if (cliente.telefono) doc.text(`Telefono: ${cliente.telefono}`);
        if (cliente.email) doc.text(`Email: ${cliente.email}`);
      } else {
        doc.text('-');
      }
      doc.moveDown(1);

      // Detalle del Pago
      doc.fontSize(12).font('Helvetica-Bold').text('Detalle del Pago');
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ccc');
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');
      if (factura) doc.text(`Factura: ${factura.numero || '-'}  (${factura.tipo || '-'})`);
      if (orden) doc.text(`Orden de Pago: ${orden.numero || '-'}`);
      doc.text(`Fecha de Pago: ${pago.fechaPago ? new Date(pago.fechaPago).toLocaleDateString('es-AR') : '-'}`);
      doc.text(`Medio de Pago: ${pago.medioPago}`);
      if (pago.referenciaPago) doc.text(`Referencia: ${pago.referenciaPago}`);
      if (convenio) doc.text(`Convenio: ${convenio.nombre}`);
      doc.moveDown(1);

      // Desglose de Montos
      doc.fontSize(12).font('Helvetica-Bold').text('Desglose de Montos');
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ccc');
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');
      const rows: [string, string][] = [
        ['Monto Base', fmt(pago.montoBase)],
      ];
      const totalRetenciones = (pago.retencionIIBB || 0) + (pago.retencionGanancias || 0) + (pago.retencionIVA || 0) + (pago.retencionSUSS || 0) + (pago.otrasRetenciones || 0);
      if (pago.retencionIIBB) rows.push(['Retencion IIBB', `- ${fmt(pago.retencionIIBB)}`]);
      if (pago.retencionGanancias) rows.push(['Retencion Ganancias', `- ${fmt(pago.retencionGanancias)}`]);
      if (pago.retencionIVA) rows.push(['Retencion IVA', `- ${fmt(pago.retencionIVA)}`]);
      if (pago.retencionSUSS) rows.push(['Retencion SUSS', `- ${fmt(pago.retencionSUSS)}`]);
      if (pago.otrasRetenciones) rows.push(['Otras Retenciones', `- ${fmt(pago.otrasRetenciones)}`]);
      if (totalRetenciones > 0) rows.push(['Total Retenciones', `- ${fmt(totalRetenciones)}`]);
      if (pago.comision) rows.push([`Comision (${pago.porcentajeComision}%)`, `- ${fmt(pago.comision)}`]);
      if (pago.descuento) rows.push([`Descuento (${pago.porcentajeDescuento}%)`, `- ${fmt(pago.descuento)}`]);

      for (const [label, value] of rows) {
        doc.text(label, 70, doc.y, { continued: true, width: 300 });
        doc.text(value, { align: 'right', width: 175 });
      }
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#333');
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold').fontSize(12);
      doc.text('MONTO NETO TRANSFERIDO', 70, doc.y, { continued: true, width: 300 });
      doc.text(fmt(pago.montoNeto), { align: 'right', width: 175 });

      if (pago.observaciones) {
        doc.moveDown(1.5);
        doc.fontSize(10).font('Helvetica-Bold').text('Observaciones');
        doc.font('Helvetica').text(pago.observaciones);
      }

      doc.end();
    });
  }
}
