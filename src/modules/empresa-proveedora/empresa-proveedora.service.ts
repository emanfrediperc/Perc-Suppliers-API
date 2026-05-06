import { Injectable, NotFoundException, ConflictException, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EmpresaProveedora, EmpresaProveedoraDocument } from './schemas/empresa-proveedora.schema';
import { CreateEmpresaProveedoraDto } from './dto/create-empresa-proveedora.dto';
import { UpdateEmpresaProveedoraDto } from './dto/update-empresa-proveedora.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { escapeRegex } from '../../common/utils/escape-regex';
import { IFinnegansService } from '../../integrations/finnegans/finnegans.interface';

@Injectable()
export class EmpresaProveedoraService {
  constructor(
    @InjectModel(EmpresaProveedora.name) private empresaModel: Model<EmpresaProveedoraDocument>,
    @Inject('FINNEGANS_SERVICE') private finnegansService: IFinnegansService,
  ) {}

  async create(dto: CreateEmpresaProveedoraDto): Promise<EmpresaProveedoraDocument> {
    const existing = await this.empresaModel.findOne({ cuit: dto.cuit });
    if (existing) throw new ConflictException('Ya existe una empresa con ese CUIT');
    const finnegansResult = await this.finnegansService.createCompanyInERP({ cuit: dto.cuit, razonSocial: dto.razonSocial });
    return this.empresaModel.create({ ...dto, finnegansId: finnegansResult.finnegansId });
  }

  async findAll(query: PaginationQueryDto, sinConvenio = false): Promise<PaginatedResponseDto<EmpresaProveedoraDocument>> {
    const { page, limit, search, sortBy, sortOrder } = query;
    const filter: any = {};
    if (search) { const escaped = escapeRegex(search); filter.$or = [{ razonSocial: { $regex: escaped, $options: 'i' } }, { cuit: { $regex: escaped, $options: 'i' } }, { nombreFantasia: { $regex: escaped, $options: 'i' } }]; }
    if (sinConvenio) { filter.convenios = { $size: 0 }; }
    const sort: any = sortBy ? { [sortBy]: sortOrder === 'asc' ? 1 : -1 } : { createdAt: -1 };
    const [data, total] = await Promise.all([
      this.empresaModel.find(filter).populate('convenios').sort(sort).skip((page - 1) * limit).limit(limit),
      this.empresaModel.countDocuments(filter),
    ]);
    return new PaginatedResponseDto(data, total, page, limit);
  }

  async findOne(id: string): Promise<EmpresaProveedoraDocument> {
    const empresa = await this.empresaModel.findById(id).populate('convenios');
    if (!empresa) throw new NotFoundException('Empresa proveedora no encontrada');
    return empresa;
  }

  async findByCuit(cuit: string) {
    return this.empresaModel.findOne({ cuit }).populate('convenios');
  }

  async update(id: string, dto: UpdateEmpresaProveedoraDto): Promise<EmpresaProveedoraDocument> {
    const empresa = await this.empresaModel.findByIdAndUpdate(id, dto, { new: true });
    if (!empresa) throw new NotFoundException('Empresa proveedora no encontrada');
    return empresa;
  }

  async setApocrifoOverride(id: string, activo: boolean, motivo: string | undefined, adminEmail: string) {
    const update: any = { apocrifoOverride: activo };
    if (activo) {
      if (!motivo) throw new NotFoundException('Motivo requerido para activar override');
      update.apocrifoOverrideMotivo = motivo;
      update.apocrifoOverridePor = adminEmail;
      update.apocrifoOverrideFecha = new Date();
    } else {
      update.apocrifoOverrideMotivo = null;
      update.apocrifoOverridePor = null;
      update.apocrifoOverrideFecha = null;
    }
    const empresa = await this.empresaModel.findByIdAndUpdate(id, update, { new: true });
    if (!empresa) throw new NotFoundException('Empresa proveedora no encontrada');
    return empresa;
  }
}
