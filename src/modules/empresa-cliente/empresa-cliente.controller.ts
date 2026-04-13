import { Controller, Get, Post, Patch, Param, Body, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as express from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { EmpresaClienteService } from './empresa-cliente.service';
import { CreateEmpresaClienteDto } from './dto/create-empresa-cliente.dto';
import { UpdateEmpresaClienteDto } from './dto/update-empresa-cliente.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AfipService } from '../../integrations/afip/afip.service';
import { ExportService, ExportColumn } from '../../common/services/export.service';

@ApiTags('Empresas Clientes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('empresas-clientes')
export class EmpresaClienteController {
  constructor(
    private readonly service: EmpresaClienteService,
    private readonly afipService: AfipService,
    private readonly exportService: ExportService,
  ) {}

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateEmpresaClienteDto) { return this.service.create(dto); }

  @Get()
  @Roles('admin', 'tesoreria', 'contabilidad', 'consulta')
  findAll(@Query() query: PaginationQueryDto) { return this.service.findAll(query); }

  @Get('export')
  @Roles('admin', 'tesoreria', 'contabilidad', 'consulta')
  async export(@Query() query: PaginationQueryDto, @Query('formato') formato: string, @Res() res: express.Response) {
    const bigQuery = { ...query, page: 1, limit: 10000 };
    const result = await this.service.findAll(bigQuery);
    const columns: ExportColumn[] = [
      { header: 'Razón Social', key: 'razonSocial', type: 'text', width: 32 },
      { header: 'Nombre Fantasía', key: 'nombreFantasia', type: 'text', width: 24 },
      { header: 'CUIT', key: 'cuit', type: 'cuit' },
      { header: 'Condición IVA', key: 'condicionIva', type: 'text', width: 22 },
      { header: 'Email', key: 'email', type: 'text', width: 28 },
      { header: 'Teléfono', key: 'telefono', type: 'text', width: 18 },
      { header: 'Dirección', key: 'direccion', type: 'text', width: 32 },
      { header: 'Activa', key: 'activa', type: 'boolean' },
    ];
    const filterSummary = query.search ? `Búsqueda: "${query.search}"` : undefined;
    if (formato === 'csv') {
      const csv = await this.exportService.generateCsv(result.data, columns);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=empresas-clientes.csv');
      res.send(csv);
    } else {
      const buffer = await this.exportService.generateExcel(result.data, columns, 'Empresas Clientes', {
        title: 'Empresas Clientes', filterSummary,
      });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=empresas-clientes.xlsx');
      res.send(buffer);
    }
  }

  @Get('consultar-cuit/:cuit')
  @Roles('admin', 'tesoreria', 'contabilidad')
  consultarCuit(@Param('cuit') cuit: string) {
    return this.afipService.consultarCuit(cuit);
  }

  @Get(':id')
  @Roles('admin', 'tesoreria', 'contabilidad', 'consulta')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdateEmpresaClienteDto) { return this.service.update(id, dto); }
}
