import {
  Body, Controller, Get, Param, Patch, Post, Query, UploadedFiles, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { SolicitudPagoService } from './solicitud-pago.service';
import { CreateSolicitudPagoDto } from './dto/create-solicitud-pago.dto';
import { AprobarDto, EjecutarDto, CancelarDto, ReagendarDto } from './dto/transition.dto';
import { ProcesarSolicitudPagoDto } from './dto/procesar.dto';
import { SolicitudPagoQueryDto } from './dto/query.dto';

@ApiTags('Solicitudes de Pago')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('solicitudes-pago')
export class SolicitudPagoController {
  constructor(private readonly service: SolicitudPagoService) {}

  @Post()
  @Roles('admin', 'tesoreria')
  create(@Body() dto: CreateSolicitudPagoDto, @CurrentUser() user: { userId: string; email: string }) {
    return this.service.create(dto, user);
  }

  @Get()
  @Roles('admin', 'tesoreria', 'contabilidad', 'operador', 'consulta')
  findAll(@Query() query: SolicitudPagoQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Roles('admin', 'tesoreria', 'contabilidad', 'operador', 'consulta')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/verificar-integridad')
  @Roles('admin', 'tesoreria', 'contabilidad', 'operador', 'consulta')
  verificarIntegridad(@Param('id') id: string) {
    return this.service.verificarIntegridad(id);
  }

  @Get(':id/comprobante/:tipo')
  @Roles('admin', 'tesoreria', 'contabilidad', 'operador', 'consulta')
  comprobante(@Param('id') id: string, @Param('tipo') tipo: 'perc' | 'retenciones') {
    return this.service.getComprobanteUrl(id, tipo);
  }

  @Patch(':id/aprobar')
  @Roles('admin', 'contabilidad')
  aprobar(@Param('id') id: string, @Body() dto: AprobarDto, @CurrentUser() user: any) {
    return this.service.aprobar(id, dto.motivo, user);
  }

  @Patch(':id/ejecutar')
  @Roles('admin', 'tesoreria')
  ejecutar(@Param('id') id: string, @Body() dto: EjecutarDto, @CurrentUser() user: any) {
    return this.service.ejecutar(id, dto.motivo, user);
  }

  @Patch(':id/procesar')
  @Roles('admin', 'operador')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'perc', maxCount: 1 },
    { name: 'retenciones', maxCount: 1 },
  ]))
  procesar(
    @Param('id') id: string,
    @Body() dto: ProcesarSolicitudPagoDto,
    @UploadedFiles() files: { perc?: Express.Multer.File[]; retenciones?: Express.Multer.File[] },
    @CurrentUser() user: any,
  ) {
    return this.service.procesar(
      id,
      dto,
      { perc: files.perc?.[0], retenciones: files.retenciones?.[0] },
      user,
    );
  }

  @Patch(':id/cancelar')
  @Roles('admin', 'tesoreria')
  cancelar(@Param('id') id: string, @Body() dto: CancelarDto, @CurrentUser() user: any) {
    return this.service.cancelar(id, dto, user);
  }

  @Patch(':id/reagendar')
  @Roles('admin', 'tesoreria')
  reagendar(@Param('id') id: string, @Body() dto: ReagendarDto, @CurrentUser() user: any) {
    return this.service.reagendar(id, dto, user);
  }
}
