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
  EmpresaKind,
} from './schemas/compra-moneda-extranjera.schema';
import {
  EmpresaCliente,
  EmpresaClienteDocument,
} from '../empresa-cliente/schemas/empresa-cliente.schema';
import {
  EmpresaProveedora,
  EmpresaProveedoraDocument,
} from '../empresa-proveedora/schemas/empresa-proveedora.schema';
import { CreateCompraMonedaExtranjeraDto } from './dto/create-compra-moneda-extranjera.dto';
import { QueryComprasMonedaExtranjeraDto } from './dto/query-compras-moneda-extranjera.dto';
import { AnularCompraMonedaExtranjeraDto } from './dto/anular-compra-moneda-extranjera.dto';
import { EjecutarCompraMonedaExtranjeraDto } from './dto/ejecutar-compra-moneda-extranjera.dto';
import { EstimarEjecucionCompraMonedaExtranjeraDto } from './dto/estimar-ejecucion-compra-moneda-extranjera.dto';
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
    @InjectModel(EmpresaProveedora.name)
    private proveedoraModel: Model<EmpresaProveedoraDocument>,
  ) {}

  private async resolveEmpresa(
    id: string,
    kind: EmpresaKind,
  ): Promise<{ empresaId: Types.ObjectId; empresaKind: EmpresaKind; razonSocialCache: string }> {
    const empresa = kind === 'cliente'
      ? await this.clienteModel.findById(id).select('razonSocial activa').lean().exec()
      : await this.proveedoraModel.findById(id).select('razonSocial activa').lean().exec();

    if (!empresa) {
      throw new NotFoundException(`Empresa ${kind} no encontrada`);
    }

    if ((empresa as { activa: boolean }).activa === false) {
      throw new UnprocessableEntityException(`Empresa ${kind} inactiva`);
    }

    return {
      empresaId: new Types.ObjectId(id),
      empresaKind: kind,
      razonSocialCache: (empresa as { razonSocial: string }).razonSocial,
    };
  }

  async create(
    dto: CreateCompraMonedaExtranjeraDto,
    userId: string,
  ): Promise<CompraMonedaExtranjeraDocument> {
    if (dto.monedaOrigen === dto.monedaDestino) {
      throw new UnprocessableEntityException(
        'La moneda de origen y destino deben ser distintas',
      );
    }

    const empresa = await this.resolveEmpresa(dto.empresaId, dto.empresaKind);

    const compra = new this.model({
      fechaSolicitada: new Date(dto.fechaSolicitada),
      monedaOrigen: dto.monedaOrigen,
      monedaDestino: dto.monedaDestino,
      empresa,
      montoOrigen: dto.montoOrigen,
      tipoCambio: dto.tipoCambio,
      montoDestino: dto.montoDestino,
      contraparte: dto.contraparte,
      comision: dto.comision ?? 0,
      referencia: dto.referencia,
      observaciones: dto.observaciones,
      estado: EstadoCompraMonedaExtranjera.SOLICITADA,
      creadoPor: new Types.ObjectId(userId),
    });

    return compra.save();
  }

  async findAll(query: QueryComprasMonedaExtranjeraDto): Promise<PaginatedCompras> {
    const filter: Record<string, unknown> = {};

    if (query.monedaOrigen !== undefined) filter.monedaOrigen = query.monedaOrigen;
    if (query.monedaDestino !== undefined) filter.monedaDestino = query.monedaDestino;
    if (query.estado !== undefined) filter.estado = query.estado;
    if (query.empresaId) {
      filter['empresa.empresaId'] = new Types.ObjectId(query.empresaId);
    }

    if (query.fechaDesde || query.fechaHasta) {
      const fechaFilter: Record<string, Date> = {};
      if (query.fechaDesde) fechaFilter.$gte = new Date(query.fechaDesde);
      if (query.fechaHasta) fechaFilter.$lte = new Date(query.fechaHasta);
      filter.fechaSolicitada = fechaFilter;
    }

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.model.find(filter).sort({ fechaSolicitada: -1 }).skip(skip).limit(limit).exec(),
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

    const compra = await this.model
      .findById(id)
      .populate('creadoPor', 'nombre email')
      .exec();
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

    if (compra.estado !== EstadoCompraMonedaExtranjera.SOLICITADA) {
      throw new UnprocessableEntityException(
        `Solo se pueden anular compras en estado SOLICITADA (actual: ${compra.estado})`,
      );
    }

    compra.estado = EstadoCompraMonedaExtranjera.ANULADA;
    compra.anuladoPor = new Types.ObjectId(userId);
    compra.anuladoAt = new Date();

    if (dto.motivo) {
      compra.motivoAnulacion = dto.motivo;
    }

    return compra.save();
  }

  async ejecutar(
    id: string,
    dto: EjecutarCompraMonedaExtranjeraDto,
    userId: string,
  ): Promise<CompraMonedaExtranjeraDocument> {
    const compra = await this.findOne(id);

    if (compra.estado !== EstadoCompraMonedaExtranjera.SOLICITADA) {
      throw new UnprocessableEntityException(
        `Solo se pueden ejecutar compras en estado SOLICITADA (actual: ${compra.estado})`,
      );
    }

    compra.estado = EstadoCompraMonedaExtranjera.EJECUTADA;
    compra.fechaEjecutada = new Date(dto.fechaEjecutada);
    compra.ejecutadoPor = new Types.ObjectId(userId);
    compra.ejecutadoAt = new Date();

    if (dto.observaciones) {
      compra.observaciones = compra.observaciones
        ? `${compra.observaciones}\n${dto.observaciones}`
        : dto.observaciones;
    }

    return compra.save();
  }

  async estimarEjecucion(
    id: string,
    dto: EstimarEjecucionCompraMonedaExtranjeraDto,
  ): Promise<CompraMonedaExtranjeraDocument> {
    const compra = await this.findOne(id);

    if (compra.estado !== EstadoCompraMonedaExtranjera.SOLICITADA) {
      throw new UnprocessableEntityException(
        `Solo se puede estimar fecha en compras SOLICITADA (actual: ${compra.estado})`,
      );
    }

    compra.fechaEstimadaEjecucion = new Date(dto.fechaEstimadaEjecucion);
    return compra.save();
  }
}
