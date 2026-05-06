import { Controller, Get, Post, Patch, Param, Body, Query, Res, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as express from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { EmpresaProveedoraService } from './empresa-proveedora.service';
import { CreateEmpresaProveedoraDto } from './dto/create-empresa-proveedora.dto';
import { UpdateEmpresaProveedoraDto } from './dto/update-empresa-proveedora.dto';
import { EmpresaProveedoraQueryDto } from './dto/empresa-proveedora-query.dto';
import { AfipService } from '../../integrations/afip/afip.service';
import { ExportService, ExportColumn } from '../../common/services/export.service';

@ApiTags('Empresas Proveedoras')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('empresas-proveedoras')
export class EmpresaProveedoraController {
  constructor(
    private readonly service: EmpresaProveedoraService,
    private readonly afipService: AfipService,
    private readonly exportService: ExportService,
  ) {}

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateEmpresaProveedoraDto) { return this.service.create(dto); }

  @Get()
  @Roles('admin', 'tesoreria', 'operador', 'consulta')
  findAll(@Query() query: EmpresaProveedoraQueryDto) {
    const sinConvenio = query.sinConvenio === 'true';
    return this.service.findAll(query, sinConvenio);
  }

  @Get('export')
  @Roles('admin', 'tesoreria', 'operador')
  async export(@Query() query: EmpresaProveedoraQueryDto, @Query('formato') formato: string, @Res() res: express.Response) {
    const bigQuery = { ...query, page: 1, limit: 10000 };
    const result = await this.service.findAll(bigQuery, query.sinConvenio === 'true');
    const columns: ExportColumn[] = [
      { header: 'Razón Social', key: 'razonSocial', type: 'text', width: 32 },
      { header: 'Nombre Fantasía', key: 'nombreFantasia', type: 'text', width: 24 },
      { header: 'CUIT', key: 'cuit', type: 'cuit' },
      { header: 'Condición IVA', key: 'condicionIva', type: 'text', width: 22 },
      { header: 'Email', key: 'email', type: 'text', width: 28 },
      { header: 'Teléfono', key: 'telefono', type: 'text', width: 18 },
      { header: 'Dirección', key: 'direccion', type: 'text', width: 32 },
      { header: 'Contacto', key: 'contacto', type: 'text', width: 22 },
      { header: 'Banco', key: 'datosBancarios.banco', type: 'text', width: 18 },
      { header: 'CBU', key: 'datosBancarios.cbu', type: 'text', width: 26 },
      { header: 'Alias', key: 'datosBancarios.alias', type: 'text', width: 20 },
      { header: 'Activa', key: 'activa', type: 'boolean' },
    ];
    const filterSummary = query.search ? `Búsqueda: "${query.search}"` : undefined;
    if (formato === 'csv') {
      const csv = await this.exportService.generateCsv(result.data, columns);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=empresas-proveedoras.csv');
      res.send(csv);
    } else {
      const buffer = await this.exportService.generateExcel(result.data, columns, 'Empresas Proveedoras', {
        title: 'Empresas Proveedoras', filterSummary,
      });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=empresas-proveedoras.xlsx');
      res.send(buffer);
    }
  }

  @Get('consultar-cuit/:cuit')
  @Roles('admin', 'tesoreria', 'operador')
  consultarCuit(@Param('cuit') cuit: string) {
    return this.afipService.consultarCuit(cuit);
  }

  @Get(':id')
  @Roles('admin', 'tesoreria', 'operador')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdateEmpresaProveedoraDto) { return this.service.update(id, dto); }

  @Patch(':id/apocrifo-override')
  @Roles('admin')
  setApocrifoOverride(
    @Param('id') id: string,
    @Body() body: { activo: boolean; motivo?: string },
    @Req() req: any,
  ) {
    return this.service.setApocrifoOverride(id, body.activo, body.motivo, req.user?.email || 'admin');
  }
}
