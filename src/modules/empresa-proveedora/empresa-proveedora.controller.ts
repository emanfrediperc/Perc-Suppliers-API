import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { EmpresaProveedoraService } from './empresa-proveedora.service';
import { CreateEmpresaProveedoraDto } from './dto/create-empresa-proveedora.dto';
import { UpdateEmpresaProveedoraDto } from './dto/update-empresa-proveedora.dto';
import { EmpresaProveedoraQueryDto } from './dto/empresa-proveedora-query.dto';
import { AfipService } from '../../integrations/afip/afip.service';

@ApiTags('Empresas Proveedoras')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('empresas-proveedoras')
export class EmpresaProveedoraController {
  constructor(
    private readonly service: EmpresaProveedoraService,
    private readonly afipService: AfipService,
  ) {}

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateEmpresaProveedoraDto) { return this.service.create(dto); }

  @Get() findAll(@Query() query: EmpresaProveedoraQueryDto) {
    const sinConvenio = query.sinConvenio === 'true';
    return this.service.findAll(query, sinConvenio);
  }

  @Get('consultar-cuit/:cuit')
  consultarCuit(@Param('cuit') cuit: string) {
    return this.afipService.consultarCuit(cuit);
  }

  @Get(':id') findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdateEmpresaProveedoraDto) { return this.service.update(id, dto); }
}
