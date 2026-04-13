import { Controller, Get, Post, Patch, Param, Body, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as express from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { PagoService } from './pago.service';
import { CreatePagoDto } from './dto/create-pago.dto';
import { UpdatePagoDto } from './dto/update-pago.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@ApiTags('Pagos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pagos')
export class PagoController {
  constructor(private readonly service: PagoService) {}

  @Post()
  @Roles('admin', 'tesoreria')
  create(@Body() dto: CreatePagoDto) { return this.service.create(dto); }

  @Get()
  @Roles('admin', 'tesoreria', 'contabilidad', 'consulta')
  findAll(@Query() query: PaginationQueryDto) { return this.service.findAll(query); }

  @Get(':id/comprobante')
  @Roles('admin', 'tesoreria', 'contabilidad', 'consulta')
  async comprobante(@Param('id') id: string, @Res() res: express.Response) {
    const buffer = await this.service.generateComprobante(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=comprobante-${id}.pdf`);
    res.send(buffer);
  }

  @Get(':id')
  @Roles('admin', 'tesoreria', 'contabilidad', 'consulta')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Patch(':id')
  @Roles('admin', 'tesoreria')
  update(@Param('id') id: string, @Body() dto: UpdatePagoDto) { return this.service.update(id, dto); }

  @Patch(':id/anular')
  @Roles('admin', 'tesoreria')
  anular(@Param('id') id: string) { return this.service.anular(id); }
}
