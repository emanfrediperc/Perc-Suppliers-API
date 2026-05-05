import { Controller, Get, Post, Patch, Param, Body, Query, Res, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
  @ApiOperation({
    deprecated: true,
    summary: 'DEPRECATED — usar POST /api/v1/solicitudes-pago',
    description: 'El flujo de creación directa de Pago fue reemplazado por SolicitudPago (workflow con aprobación de contabilidad). Este endpoint queda como escape hatch para correcciones manuales y será removido en una versión futura.',
  })
  create(@Body() dto: CreatePagoDto, @Req() req: any) {
    return this.service.create(dto, { userId: req.user.userId, email: req.user.email });
  }

  @Get()
  @Roles('admin', 'tesoreria', 'operador', 'consulta')
  findAll(@Query() query: PaginationQueryDto) { return this.service.findAll(query); }

  @Get(':id/comprobante')
  @Roles('admin', 'tesoreria', 'operador', 'consulta')
  async comprobante(@Param('id') id: string, @Res() res: express.Response) {
    const buffer = await this.service.generateComprobante(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=comprobante-${id}.pdf`);
    res.send(buffer);
  }

  @Get(':id')
  @Roles('admin', 'tesoreria', 'operador', 'consulta')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Patch(':id')
  @Roles('admin', 'tesoreria')
  update(@Param('id') id: string, @Body() dto: UpdatePagoDto) { return this.service.update(id, dto); }

  @Patch(':id/anular')
  @Roles('admin', 'tesoreria', 'operador')
  anular(@Param('id') id: string) { return this.service.anular(id); }
}
