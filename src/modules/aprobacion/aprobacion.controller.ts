import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AprobacionService } from './aprobacion.service';
import { DecidirAprobacionDto } from './dto/decidir-aprobacion.dto';

@ApiTags('Aprobaciones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('aprobaciones')
export class AprobacionController {
  constructor(private readonly service: AprobacionService) {}

  @Get('pendientes')
  @Roles('admin', 'tesoreria')
  findPendientes() {
    return this.service.findPendientes();
  }

  @Get('count')
  @Roles('admin', 'tesoreria')
  countPendientes() {
    return this.service.countPendientes();
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get('entidad/:entidad/:entidadId')
  findByEntity(@Param('entidad') entidad: string, @Param('entidadId') entidadId: string) {
    return this.service.findByEntity(entidad, entidadId);
  }

  @Patch(':id/decidir')
  @Roles('admin', 'tesoreria')
  decidir(
    @Param('id') id: string,
    @Body() dto: DecidirAprobacionDto,
    @CurrentUser() user: any,
  ) {
    return this.service.decidir(id, { userId: user.userId, email: user.email }, dto.decision, dto.comentario);
  }
}
