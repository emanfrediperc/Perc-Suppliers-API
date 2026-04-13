import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as express from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ConvenioService } from './convenio.service';
import { CreateConvenioDto } from './dto/create-convenio.dto';
import { UpdateConvenioDto } from './dto/update-convenio.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ExportService, ExportColumn } from '../../common/services/export.service';

@ApiTags('Convenios')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('convenios')
export class ConvenioController {
  constructor(
    private readonly service: ConvenioService,
    private readonly exportService: ExportService,
  ) {}

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateConvenioDto) { return this.service.create(dto); }

  @Get()
  @Roles('admin', 'tesoreria', 'contabilidad', 'consulta')
  findAll(@Query() query: PaginationQueryDto) { return this.service.findAll(query); }

  @Get('export')
  @Roles('admin', 'tesoreria', 'contabilidad', 'consulta')
  async export(@Query() query: PaginationQueryDto, @Query('formato') formato: string, @Res() res: express.Response) {
    const bigQuery = { ...query, page: 1, limit: 10000 };
    const result = await this.service.findAll(bigQuery);
    const columns: ExportColumn[] = [
      { header: 'Nombre', key: 'nombre', type: 'text', width: 28 },
      { header: 'Descripción', key: 'descripcion', type: 'text', width: 40 },
      { header: 'Comisión %', key: 'comisionPorcentaje', type: 'percent' },
      { header: 'Descuento %', key: 'descuentoPorcentaje', type: 'percent' },
      { header: 'Empresas', key: 'empresasProveedoras', type: 'number', format: (v: any) => Array.isArray(v) ? v.length : 0 },
      { header: 'Activo', key: 'activo', type: 'boolean' },
      { header: 'Vigencia', key: 'fechaVigencia', type: 'date' },
    ];
    const filterSummary = query.search ? `Búsqueda: "${query.search}"` : undefined;
    if (formato === 'csv') {
      const csv = await this.exportService.generateCsv(result.data, columns);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=convenios.csv');
      res.send(csv);
    } else {
      const buffer = await this.exportService.generateExcel(result.data, columns, 'Convenios', {
        title: 'Convenios', filterSummary,
      });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=convenios.xlsx');
      res.send(buffer);
    }
  }

  @Get(':id')
  @Roles('admin', 'tesoreria', 'contabilidad', 'consulta')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdateConvenioDto) { return this.service.update(id, dto); }

  @Post(':id/empresas')
  @Roles('admin')
  addEmpresa(@Param('id') id: string, @Body('empresaId') empresaId: string) { return this.service.addEmpresa(id, empresaId); }

  @Delete(':id/empresas/:empresaId')
  @Roles('admin')
  removeEmpresa(@Param('id') id: string, @Param('empresaId') empresaId: string) { return this.service.removeEmpresa(id, empresaId); }
}
