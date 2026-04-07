import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { EmpresaClienteService } from './empresa-cliente.service';
import { CreateEmpresaClienteDto } from './dto/create-empresa-cliente.dto';
import { UpdateEmpresaClienteDto } from './dto/update-empresa-cliente.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AfipService } from '../../integrations/afip/afip.service';

@ApiTags('Empresas Clientes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('empresas-clientes')
export class EmpresaClienteController {
  constructor(
    private readonly service: EmpresaClienteService,
    private readonly afipService: AfipService,
  ) {}

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateEmpresaClienteDto) { return this.service.create(dto); }

  @Get() findAll(@Query() query: PaginationQueryDto) { return this.service.findAll(query); }

  @Get('consultar-cuit/:cuit')
  consultarCuit(@Param('cuit') cuit: string) {
    return this.afipService.consultarCuit(cuit);
  }

  @Get(':id') findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdateEmpresaClienteDto) { return this.service.update(id, dto); }
}
