import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Convenio, ConvenioDocument } from './schemas/convenio.schema';
import { CreateConvenioDto } from './dto/create-convenio.dto';
import { UpdateConvenioDto } from './dto/update-convenio.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { escapeRegex } from '../../common/utils/escape-regex';
import { EmpresaProveedora, EmpresaProveedoraDocument } from '../empresa-proveedora/schemas/empresa-proveedora.schema';
import { Factura, FacturaDocument } from '../factura/schemas/factura.schema';
import { Pago, PagoDocument } from '../pago/schemas/pago.schema';
import { ExportService } from '../../common/services/export.service';

@Injectable()
export class ConvenioService {
  constructor(
    @InjectModel(Convenio.name) private convenioModel: Model<ConvenioDocument>,
    @InjectModel(EmpresaProveedora.name) private empresaModel: Model<EmpresaProveedoraDocument>,
    @InjectModel(Factura.name) private facturaModel: Model<FacturaDocument>,
    @InjectModel(Pago.name) private pagoModel: Model<PagoDocument>,
    private exportService: ExportService,
  ) {}

  async create(dto: CreateConvenioDto): Promise<ConvenioDocument> { return this.convenioModel.create(dto); }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResponseDto<ConvenioDocument>> {
    const { page, limit, search, sortBy, sortOrder } = query;
    const filter: any = {};
    if (search) { const escaped = escapeRegex(search); filter.$or = [{ nombre: { $regex: escaped, $options: 'i' } }, { descripcion: { $regex: escaped, $options: 'i' } }]; }
    const sort: any = sortBy ? { [sortBy]: sortOrder === 'asc' ? 1 : -1 } : { createdAt: -1 };
    const [data, total] = await Promise.all([
      this.convenioModel.find(filter).populate('empresasProveedoras').sort(sort).skip((page - 1) * limit).limit(limit),
      this.convenioModel.countDocuments(filter),
    ]);
    return new PaginatedResponseDto(data, total, page, limit);
  }

  async findOne(id: string): Promise<ConvenioDocument> {
    const convenio = await this.convenioModel.findById(id).populate('empresasProveedoras');
    if (!convenio) throw new NotFoundException('Convenio no encontrado');
    return convenio;
  }

  async update(id: string, dto: UpdateConvenioDto): Promise<ConvenioDocument> {
    const convenio = await this.convenioModel.findByIdAndUpdate(id, dto, { new: true });
    if (!convenio) throw new NotFoundException('Convenio no encontrado');
    return convenio;
  }

  async addEmpresa(convenioId: string, empresaId: string): Promise<ConvenioDocument> {
    const convenio = await this.convenioModel.findById(convenioId);
    if (!convenio) throw new NotFoundException('Convenio no encontrado');
    const empresa = await this.empresaModel.findById(empresaId);
    if (!empresa) throw new NotFoundException('Empresa proveedora no encontrada');
    const eId = new Types.ObjectId(empresaId);
    const cId = new Types.ObjectId(convenioId);
    if (!convenio.empresasProveedoras.some((e) => e.equals(eId))) { convenio.empresasProveedoras.push(eId); await convenio.save(); }
    if (!empresa.convenios.some((c) => c.equals(cId))) { empresa.convenios.push(cId); await empresa.save(); }
    return (await this.convenioModel.findById(convenioId).populate('empresasProveedoras'))!;
  }

  async removeEmpresa(convenioId: string, empresaId: string): Promise<ConvenioDocument> {
    const convenio = await this.convenioModel.findById(convenioId);
    if (!convenio) throw new NotFoundException('Convenio no encontrado');
    const empresa = await this.empresaModel.findById(empresaId);
    const eId = new Types.ObjectId(empresaId);
    const cId = new Types.ObjectId(convenioId);
    convenio.empresasProveedoras = convenio.empresasProveedoras.filter((e) => !e.equals(eId));
    await convenio.save();
    if (empresa) { empresa.convenios = empresa.convenios.filter((c) => !c.equals(cId)); await empresa.save(); }
    return (await this.convenioModel.findById(convenioId).populate('empresasProveedoras'))!;
  }

  async getHistorico(convenioId: string, empresaProveedora?: string) {
    const convenio = await this.convenioModel.findById(convenioId).populate('empresasProveedoras');
    if (!convenio) throw new NotFoundException('Productor no encontrado');

    const empresaIds = (convenio.empresasProveedoras as any[]).map((e: any) => e._id);
    const filterEmpresas = empresaProveedora
      ? [new Types.ObjectId(empresaProveedora)]
      : empresaIds;

    const facturas = await this.facturaModel
      .find({ empresaProveedora: { $in: filterEmpresas }, estado: { $ne: 'anulada' } })
      .populate('empresaProveedora', 'razonSocial cuit')
      .sort({ fecha: -1 })
      .lean();

    // Totales agregados (siempre sobre TODAS las empresas del productor, no solo el filtro)
    const totales = await this.facturaModel.aggregate([
      { $match: { empresaProveedora: { $in: empresaIds }, estado: { $ne: 'anulada' } } },
      { $group: {
        _id: '$empresaProveedora',
        montoTotal: { $sum: '$montoTotal' },
        saldoPendiente: { $sum: '$saldoPendiente' },
        montoPagado: { $sum: '$montoPagado' },
        cantidad: { $sum: 1 },
      } },
      { $lookup: { from: 'empresas_proveedoras', localField: '_id', foreignField: '_id', as: 'empresa' } },
      { $unwind: '$empresa' },
      { $project: {
        _id: 1,
        razonSocial: '$empresa.razonSocial',
        cuit: '$empresa.cuit',
        montoTotal: 1, saldoPendiente: 1, montoPagado: 1, cantidad: 1,
      } },
    ]);

    const totalCombinadoAdeudado = totales.reduce((sum, t) => sum + (t.saldoPendiente || 0), 0);

    return {
      productor: { _id: convenio._id, nombre: convenio.nombre, comisionPorcentaje: convenio.comisionPorcentaje, descuentoPorcentaje: convenio.descuentoPorcentaje },
      totalCombinadoAdeudado,
      porEmpresa: totales,
      facturas,
      empresaFiltrada: empresaProveedora || null,
    };
  }

  async getHistoricoExcel(convenioId: string, empresaProveedora?: string): Promise<Buffer> {
    const data = await this.getHistorico(convenioId, empresaProveedora);
    const rows = data.facturas.map((f: any) => ({
      numero: f.numero,
      tipo: f.tipo,
      fecha: f.fecha,
      proveedor: f.empresaProveedora?.razonSocial,
      cuit: f.empresaProveedora?.cuit,
      montoTotal: f.montoTotal,
      montoPagado: f.montoPagado,
      saldoPendiente: f.saldoPendiente,
      estado: f.estado,
    }));
    return this.exportService.generateExcel(rows, [
      { header: 'Numero', key: 'numero', type: 'string' as any },
      { header: 'Tipo', key: 'tipo', type: 'string' as any, width: 8 },
      { header: 'Fecha', key: 'fecha', type: 'date' as any },
      { header: 'Proveedor', key: 'proveedor', type: 'string' as any, width: 30 },
      { header: 'CUIT', key: 'cuit', type: 'string' as any, width: 16 },
      { header: 'Monto Total', key: 'montoTotal', type: 'currency' as any },
      { header: 'Pagado', key: 'montoPagado', type: 'currency' as any },
      { header: 'Saldo', key: 'saldoPendiente', type: 'currency' as any },
      { header: 'Estado', key: 'estado', type: 'string' as any, width: 12 },
    ], `Historico ${data.productor.nombre}`);
  }
}
