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

@Injectable()
export class ConvenioService {
  constructor(
    @InjectModel(Convenio.name) private convenioModel: Model<ConvenioDocument>,
    @InjectModel(EmpresaProveedora.name) private empresaModel: Model<EmpresaProveedoraDocument>,
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
}
