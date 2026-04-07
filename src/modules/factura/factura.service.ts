import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import { Factura, FacturaDocument } from './schemas/factura.schema';
import { Pago, PagoDocument } from '../pago/schemas/pago.schema';
import { OrdenPago, OrdenPagoDocument } from '../orden-pago/schemas/orden-pago.schema';
import { Convenio, ConvenioDocument } from '../convenio/schemas/convenio.schema';
import { CreateFacturaDto } from './dto/create-factura.dto';
import { UpdateFacturaDto } from './dto/update-factura.dto';
import { PagarFacturaDto } from './dto/pagar-factura.dto';
import { FacturaQueryDto } from './dto/factura-query.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { escapeRegex } from '../../common/utils/escape-regex';
import { StorageService } from '../../integrations/storage/storage.service';
import { GeminiService } from '../../integrations/gemini/gemini.service';
import { EmpresaProveedora, EmpresaProveedoraDocument } from '../empresa-proveedora/schemas/empresa-proveedora.schema';
import { EmpresaCliente, EmpresaClienteDocument } from '../empresa-cliente/schemas/empresa-cliente.schema';
import { PagoCalculatorService } from '../../common/services/pago-calculator.service';

@Injectable()
export class FacturaService {
  private readonly logger = new Logger(FacturaService.name);

  constructor(
    @InjectModel(Factura.name) private facturaModel: Model<FacturaDocument>,
    @InjectModel(Pago.name) private pagoModel: Model<PagoDocument>,
    @InjectModel(OrdenPago.name) private ordenModel: Model<OrdenPagoDocument>,
    @InjectModel(Convenio.name) private convenioModel: Model<ConvenioDocument>,
    @InjectModel(EmpresaProveedora.name) private empresaProvModel: Model<EmpresaProveedoraDocument>,
    @InjectModel(EmpresaCliente.name) private empresaCliModel: Model<EmpresaClienteDocument>,
    private storageService: StorageService,
    private geminiService: GeminiService,
    @InjectConnection() private connection: Connection,
    private pagoCalculator: PagoCalculatorService,
  ) {}

  async create(dto: CreateFacturaDto) {
    const isNotaCredito = dto.tipo.startsWith('NC-');
    const saldoPendiente = isNotaCredito ? 0 : dto.montoTotal;
    const factura = await this.facturaModel.create({
      ...dto,
      saldoPendiente,
      montoPagado: isNotaCredito ? dto.montoTotal : 0,
      estado: isNotaCredito ? 'pagada' : 'pendiente',
    });

    // If it's a credit note linked to an original invoice, reduce its saldo
    if (isNotaCredito && dto.facturaRelacionada) {
      const original = await this.facturaModel.findById(dto.facturaRelacionada);
      if (original) {
        original.saldoPendiente = Math.max(0, original.saldoPendiente - dto.montoTotal);
        original.montoPagado = original.montoTotal - original.saldoPendiente;
        if (original.saldoPendiente <= 0) original.estado = 'pagada';
        else if (original.montoPagado > 0) original.estado = 'parcial';
        await original.save();
      }
    }

    return factura;
  }

  async findAll(query: FacturaQueryDto) {
    const { page, limit, search, sortBy, sortOrder, empresaProveedora, empresaCliente, estado, fechaDesde, fechaHasta } = query;
    const filter: any = { activo: { $ne: false } };
    if (search) { const escaped = escapeRegex(search); filter.$or = [{ numero: { $regex: escaped, $options: 'i' } }]; }
    if (empresaProveedora) { filter.empresaProveedora = new Types.ObjectId(empresaProveedora); }
    if (empresaCliente) { filter.empresaCliente = new Types.ObjectId(empresaCliente); }
    if (estado) { filter.estado = estado; }
    if (fechaDesde || fechaHasta) {
      filter.fecha = {};
      if (fechaDesde) filter.fecha.$gte = new Date(fechaDesde);
      if (fechaHasta) { const h = new Date(fechaHasta); h.setHours(23, 59, 59, 999); filter.fecha.$lte = h; }
    }
    const sort: any = sortBy ? { [sortBy]: sortOrder === 'asc' ? 1 : -1 } : { fecha: -1 };
    const [data, total] = await Promise.all([
      this.facturaModel.find(filter).populate('empresaProveedora').populate('empresaCliente').populate('ordenPago').sort(sort).skip((page - 1) * limit).limit(limit),
      this.facturaModel.countDocuments(filter),
    ]);
    return new PaginatedResponseDto(data, total, page, limit);
  }

  async findOne(id: string) {
    const factura = await this.facturaModel.findById(id).populate('empresaProveedora').populate('empresaCliente').populate('ordenPago').populate('facturaRelacionada')
      .populate({ path: 'pagos', populate: { path: 'convenioAplicado' } });
    if (!factura) throw new NotFoundException('Factura no encontrada');
    return factura;
  }

  async update(id: string, dto: UpdateFacturaDto) {
    const factura = await this.facturaModel.findByIdAndUpdate(id, dto, { new: true });
    if (!factura) throw new NotFoundException('Factura no encontrada');
    return factura;
  }

  async deactivate(id: string) {
    const factura = await this.facturaModel.findById(id);
    if (!factura) throw new NotFoundException('Factura no encontrada');
    if (factura.estado === 'pagada') throw new BadRequestException('No se puede desactivar una factura pagada');
    factura.activo = false;
    await factura.save();
    return factura;
  }

  async uploadFile(file: Express.Multer.File) {
    try {
      const { url, key } = await this.storageService.upload(file);
      return { archivoUrl: url, archivoKey: key, archivoNombre: file.originalname };
    } catch (error) {
      this.logger.warn(`Storage upload falló: ${error.message}`);
      return { archivoUrl: null, archivoKey: null, archivoNombre: file.originalname };
    }
  }

  async processOcr(file: Express.Multer.File) {
    const [uploadResult, ocrResult] = await Promise.allSettled([
      this.storageService.upload(file),
      this.geminiService.extractFacturaData(file.buffer, file.mimetype),
    ]);

    const upload = uploadResult.status === 'fulfilled' ? uploadResult.value : null;
    const ocr = ocrResult.status === 'fulfilled' ? ocrResult.value : null;

    if (uploadResult.status === 'rejected') {
      this.logger.warn(`Storage upload falló: ${uploadResult.reason?.message || uploadResult.reason}`);
    }

    return {
      archivoUrl: upload?.url || null,
      archivoKey: upload?.key || null,
      archivoNombre: file.originalname,
      ocrData: ocr?.success ? ocr.data : null,
      ocrError: ocr?.success ? null : (ocr?.error || (ocrResult.status === 'rejected' ? 'Error al procesar OCR' : null)),
    };
  }

  async pagar(facturaId: string, dto: PagarFacturaDto) {
    const factura = await this.facturaModel.findById(facturaId).populate('empresaProveedora');
    if (!factura) throw new NotFoundException('Factura no encontrada');
    if (factura.estado === 'pagada') throw new BadRequestException('La factura ya esta completamente pagada');
    if (dto.montoBase > factura.saldoPendiente) throw new BadRequestException(`El monto base ($${dto.montoBase}) excede el saldo pendiente ($${factura.saldoPendiente})`);

    const convenio = await this.convenioModel.findOne({ empresasProveedoras: factura.empresaProveedora._id, activo: true });
    const calc = this.pagoCalculator.calculate(dto.montoBase, dto, convenio);

    const pagoData: any = {
      factura: factura._id, fechaPago: dto.fechaPago ? new Date(dto.fechaPago) : new Date(),
      montoBase: dto.montoBase, retencionIIBB: dto.retencionIIBB || 0, retencionGanancias: dto.retencionGanancias || 0,
      retencionIVA: dto.retencionIVA || 0, retencionSUSS: dto.retencionSUSS || 0, otrasRetenciones: dto.otrasRetenciones || 0,
      ...calc,
      medioPago: dto.medioPago, referenciaPago: dto.referenciaPago, observaciones: dto.observaciones,
      estado: 'confirmado',
    };
    if (convenio) pagoData.convenioAplicado = convenio._id;

    // Use transaction for data integrity across Pago, Factura, and OrdenPago
    const session = await this.connection.startSession();
    try {
      session.startTransaction();

      const [pago] = await this.pagoModel.create([pagoData], { session });

      factura.montoPagado += dto.montoBase;
      factura.saldoPendiente = factura.montoTotal - factura.montoPagado;
      (factura.pagos as any[]).push(pago._id);
      factura.estado = factura.saldoPendiente <= 0 ? 'pagada' : 'parcial';
      if (factura.saldoPendiente < 0) factura.saldoPendiente = 0;
      await factura.save({ session });

      if (factura.ordenPago) {
        const orden = await this.ordenModel.findById(factura.ordenPago).populate('facturas');
        if (orden) {
          const allPaid = (orden.facturas as any[]).every((f: any) => f.estado === 'pagada');
          const anyPaid = (orden.facturas as any[]).some((f: any) => f.estado === 'pagada' || f.estado === 'parcial');
          if (allPaid) orden.estado = 'pagada';
          else if (anyPaid) orden.estado = 'parcial';
          await orden.save({ session });
        }
      }

      await session.commitTransaction();
      return this.pagoModel.findById(pago._id).populate('convenioAplicado');
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async importFromExcel(buffer: Buffer): Promise<{ imported: number; errors: Array<{ row: number; error: string }> }> {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new BadRequestException('El archivo no contiene hojas de calculo');

    const errors: Array<{ row: number; error: string }> = [];
    let imported = 0;

    for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
      const row = sheet.getRow(rowNum);
      const numero = row.getCell(1).text?.trim();
      const tipo = row.getCell(2).text?.trim();
      const fecha = row.getCell(3).text?.trim();
      const fechaVencimiento = row.getCell(4).text?.trim();
      const cuitProveedor = row.getCell(5).text?.trim();
      const cuitCliente = row.getCell(6).text?.trim();
      const montoNeto = parseFloat(row.getCell(7).text);
      const montoIva = parseFloat(row.getCell(8).text) || 0;
      const montoTotal = parseFloat(row.getCell(9).text);

      if (!numero) continue; // Skip empty rows

      try {
        if (!tipo || !fecha || !cuitProveedor || isNaN(montoTotal)) {
          errors.push({ row: rowNum, error: 'Campos requeridos faltantes (numero, tipo, fecha, CUIT proveedor, montoTotal)' });
          continue;
        }

        const proveedor = await this.empresaProvModel.findOne({ cuit: cuitProveedor });
        if (!proveedor) {
          errors.push({ row: rowNum, error: `Proveedor con CUIT ${cuitProveedor} no encontrado` });
          continue;
        }

        let cliente = cuitCliente ? await this.empresaCliModel.findOne({ cuit: cuitCliente }) : null;
        if (cuitCliente && !cliente) {
          errors.push({ row: rowNum, error: `Cliente con CUIT ${cuitCliente} no encontrado` });
          continue;
        }

        // Check for duplicates
        const existing = await this.facturaModel.findOne({ numero, empresaProveedora: proveedor._id });
        if (existing) {
          errors.push({ row: rowNum, error: `Factura ${numero} ya existe para este proveedor` });
          continue;
        }

        const isNC = tipo.startsWith('NC-');
        await this.facturaModel.create({
          numero, tipo,
          fecha: new Date(fecha),
          fechaVencimiento: fechaVencimiento ? new Date(fechaVencimiento) : undefined,
          empresaProveedora: proveedor._id,
          empresaCliente: cliente?._id,
          montoNeto: isNaN(montoNeto) ? montoTotal : montoNeto,
          montoIva,
          montoTotal,
          saldoPendiente: isNC ? 0 : montoTotal,
          montoPagado: isNC ? montoTotal : 0,
          estado: isNC ? 'pagada' : 'pendiente',
        });
        imported++;
      } catch (err: any) {
        errors.push({ row: rowNum, error: err.message || 'Error desconocido' });
      }
    }

    return { imported, errors };
  }

  async checkDuplicate(numero: string, empresaProveedora: string, montoTotal?: number) {
    const exactMatch = await this.facturaModel.findOne({ numero, empresaProveedora }).populate('empresaProveedora');
    if (exactMatch) {
      return { isDuplicate: true, type: 'exact', factura: exactMatch };
    }
    if (montoTotal !== undefined) {
      const partialMatch = await this.facturaModel.findOne({
        empresaProveedora,
        montoTotal,
        numero: { $ne: numero },
      }).populate('empresaProveedora');
      if (partialMatch) {
        return { isDuplicate: true, type: 'partial', factura: partialMatch };
      }
    }
    return { isDuplicate: false };
  }
}
