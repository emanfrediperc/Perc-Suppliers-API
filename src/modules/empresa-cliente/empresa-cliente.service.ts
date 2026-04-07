import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EmpresaCliente, EmpresaClienteDocument } from './schemas/empresa-cliente.schema';
import { CreateEmpresaClienteDto } from './dto/create-empresa-cliente.dto';
import { UpdateEmpresaClienteDto } from './dto/update-empresa-cliente.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { escapeRegex } from '../../common/utils/escape-regex';

@Injectable()
export class EmpresaClienteService {
  constructor(@InjectModel(EmpresaCliente.name) private empresaModel: Model<EmpresaClienteDocument>) {}

  async create(dto: CreateEmpresaClienteDto): Promise<EmpresaClienteDocument> {
    const existing = await this.empresaModel.findOne({ cuit: dto.cuit });
    if (existing) throw new ConflictException('Ya existe una empresa con ese CUIT');
    return this.empresaModel.create(dto);
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResponseDto<EmpresaClienteDocument>> {
    const { page, limit, search, sortBy, sortOrder } = query;
    const filter: any = {};
    if (search) { const escaped = escapeRegex(search); filter.$or = [{ razonSocial: { $regex: escaped, $options: 'i' } }, { cuit: { $regex: escaped, $options: 'i' } }, { nombreFantasia: { $regex: escaped, $options: 'i' } }]; }
    const sort: any = sortBy ? { [sortBy]: sortOrder === 'asc' ? 1 : -1 } : { createdAt: -1 };
    const [data, total] = await Promise.all([
      this.empresaModel.find(filter).sort(sort).skip((page - 1) * limit).limit(limit),
      this.empresaModel.countDocuments(filter),
    ]);
    return new PaginatedResponseDto(data, total, page, limit);
  }

  async findOne(id: string): Promise<EmpresaClienteDocument> {
    const empresa = await this.empresaModel.findById(id);
    if (!empresa) throw new NotFoundException('Empresa cliente no encontrada');
    return empresa;
  }

  async findByCuit(cuit: string) { return this.empresaModel.findOne({ cuit }); }

  async update(id: string, dto: UpdateEmpresaClienteDto): Promise<EmpresaClienteDocument> {
    const empresa = await this.empresaModel.findByIdAndUpdate(id, dto, { new: true });
    if (!empresa) throw new NotFoundException('Empresa cliente no encontrada');
    return empresa;
  }
}
