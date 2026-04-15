import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CompraMonedaExtranjera,
  CompraMonedaExtranjeraDocument,
} from './schemas/compra-moneda-extranjera.schema';
import {
  EmpresaCliente,
  EmpresaClienteDocument,
} from '../empresa-cliente/schemas/empresa-cliente.schema';
import { CreateCompraMonedaExtranjeraDto } from './dto/create-compra-moneda-extranjera.dto';
import { QueryComprasMonedaExtranjeraDto } from './dto/query-compras-moneda-extranjera.dto';
import { AnularCompraMonedaExtranjeraDto } from './dto/anular-compra-moneda-extranjera.dto';
import { EstadoCompraMonedaExtranjera } from './enums/estado-compra.enum';

export interface PaginatedCompras {
  data: CompraMonedaExtranjeraDocument[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class CompraMonedaExtranjeraService {
  constructor(
    @InjectModel(CompraMonedaExtranjera.name)
    private model: Model<CompraMonedaExtranjeraDocument>,
    @InjectModel(EmpresaCliente.name)
    private clienteModel: Model<EmpresaClienteDocument>,
  ) {}

  private async resolveEmpresaCliente(
    id: string,
  ): Promise<{ empresaId: Types.ObjectId; razonSocialCache: string }> {
    const empresa = await this.clienteModel
      .findById(id)
      .select('razonSocial activa')
      .lean()
      .exec();

    if (!empresa) {
      throw new NotFoundException('Empresa cliente no encontrada');
    }

    if ((empresa as { activa: boolean }).activa === false) {
      throw new UnprocessableEntityException('Empresa cliente inactiva');
    }

    return {
      empresaId: new Types.ObjectId(id),
      razonSocialCache: (empresa as { razonSocial: string }).razonSocial,
    };
  }

  async create(
    dto: CreateCompraMonedaExtranjeraDto,
    userId: string,
  ): Promise<CompraMonedaExtranjeraDocument> {
    const empresaCliente = await this.resolveEmpresaCliente(dto.empresaClienteId);

    const compra = new this.model({
      fecha: new Date(dto.fecha),
      modalidad: dto.modalidad,
      empresaCliente,
      montoUSD: dto.montoUSD,
      tipoCambio: dto.tipoCambio,
      montoARS: dto.montoARS,
      contraparte: dto.contraparte,
      comision: dto.comision ?? 0,
      referencia: dto.referencia,
      observaciones: dto.observaciones,
      estado: EstadoCompraMonedaExtranjera.CONFIRMADA,
      creadoPor: new Types.ObjectId(userId),
    });

    return compra.save();
  }

  async findAll(query: QueryComprasMonedaExtranjeraDto): Promise<PaginatedCompras> {
    const filter: Record<string, unknown> = {};

    if (query.modalidad !== undefined) filter.modalidad = query.modalidad;
    if (query.estado !== undefined) filter.estado = query.estado;
    if (query.empresaClienteId) {
      filter['empresaCliente.empresaId'] = new Types.ObjectId(query.empresaClienteId);
    }

    if (query.fechaDesde || query.fechaHasta) {
      const fechaFilter: Record<string, Date> = {};
      if (query.fechaDesde) fechaFilter.$gte = new Date(query.fechaDesde);
      if (query.fechaHasta) fechaFilter.$lte = new Date(query.fechaHasta);
      filter.fecha = fechaFilter;
    }

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.model.find(filter).sort({ fecha: -1 }).skip(skip).limit(limit).exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string): Promise<CompraMonedaExtranjeraDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }

    const compra = await this.model.findById(id).exec();
    if (!compra) {
      throw new NotFoundException('Compra no encontrada');
    }

    return compra;
  }

  async anular(
    id: string,
    dto: AnularCompraMonedaExtranjeraDto,
    userId: string,
  ): Promise<CompraMonedaExtranjeraDocument> {
    const compra = await this.findOne(id);

    if (compra.estado === EstadoCompraMonedaExtranjera.ANULADA) {
      throw new UnprocessableEntityException('La compra ya se encuentra anulada');
    }

    compra.estado = EstadoCompraMonedaExtranjera.ANULADA;
    compra.anuladoPor = new Types.ObjectId(userId);
    compra.anuladoAt = new Date();

    if (dto.motivo) {
      compra.motivoAnulacion = dto.motivo;
    }

    return compra.save();
  }
}
