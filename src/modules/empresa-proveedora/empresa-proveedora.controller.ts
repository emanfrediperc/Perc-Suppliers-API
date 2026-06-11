import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Res,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as express from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { prepararEmpresaBancarios } from '../../common/utils/datos-bancarios.util';
import { EmpresaProveedoraService } from './empresa-proveedora.service';
import { CreateEmpresaProveedoraDto } from './dto/create-empresa-proveedora.dto';
import { UpdateEmpresaProveedoraDto } from './dto/update-empresa-proveedora.dto';
import { EmpresaProveedoraQueryDto } from './dto/empresa-proveedora-query.dto';
import { AfipService } from '../../integrations/afip/afip.service';
import {
  ExportService,
  ExportColumn,
} from '../../common/services/export.service';

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
  create(@Body() dto: CreateEmpresaProveedoraDto) {
    return this.service.create(dto);
  }

  @Get()
  @Roles('admin', 'tesoreria', 'operador', 'consulta')
  async findAll(
    @Query() query: EmpresaProveedoraQueryDto,
    @CurrentUser() user: any,
  ) {
    const sinConvenio = query.sinConvenio === 'true';
    const res = await this.service.findAll(query, sinConvenio);
    // Descifra el CBU para quien puede verlo; lo enmascara para el resto.
    return {
      ...res,
      data: res.data.map((e) => prepararEmpresaBancarios(e, user?.role)),
    };
  }

  @Get('export')
  @Roles('admin', 'tesoreria', 'operador')
  async export(
    @Query() query: EmpresaProveedoraQueryDto,
    @Query('formato') formato: string,
    @Res() res: express.Response,
    @CurrentUser() user?: any,
  ) {
    const bigQuery = { ...query, page: 1, limit: 10000 };
    const result = await this.service.findAll(
      bigQuery,
      query.sinConvenio === 'true',
    );
    // CBU descifrado para quien puede verlo (admin/tesorería/operador), enmascarado para el resto.
    result.data = result.data.map((e) =>
      prepararEmpresaBancarios(e, user?.role),
    ) as typeof result.data;
    const columns: ExportColumn[] = [
      { header: 'Razón Social', key: 'razonSocial', type: 'text', width: 32 },
      {
        header: 'Nombre Fantasía',
        key: 'nombreFantasia',
        type: 'text',
        width: 24,
      },
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
    const filterSummary = query.search
      ? `Búsqueda: "${query.search}"`
      : undefined;
    if (formato === 'csv') {
      const csv = await this.exportService.generateCsv(result.data, columns);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename=empresas-proveedoras.csv',
      );
      res.send(csv);
    } else {
      const buffer = await this.exportService.generateExcel(
        result.data,
        columns,
        'Empresas Proveedoras',
        {
          title: 'Empresas Proveedoras',
          filterSummary,
        },
      );
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename=empresas-proveedoras.xlsx',
      );
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
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    const emp = await this.service.findOne(id);
    return prepararEmpresaBancarios(emp, user?.role);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdateEmpresaProveedoraDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/apocrifo-override')
  @Roles('admin')
  setApocrifoOverride(
    @Param('id') id: string,
    @Body() body: { activo: boolean; motivo?: string },
    @Req() req: any,
  ) {
    return this.service.setApocrifoOverride(
      id,
      body.activo,
      body.motivo,
      req.user?.email || 'admin',
    );
  }
}
