import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { PagoProgramadoService } from './pago-programado.service';
import { CreatePagoProgramadoDto } from './dto/create-pago-programado.dto';

@ApiTags('Pagos Programados')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pagos-programados')
export class PagoProgramadoController {
  constructor(private readonly service: PagoProgramadoService) {}

  @Post()
  @Roles('admin', 'tesoreria')
  create(@Body() dto: CreatePagoProgramadoDto, @CurrentUser() user: any) {
    return this.service.create(dto, user?.email);
  }

  @Get()
  findAll(@Query('estado') estado?: string, @Query('page') page?: number, @Query('limit') limit?: number) {
    return this.service.findAll({ estado, page: page ? +page : undefined, limit: limit ? +limit : undefined });
  }

  @Get('proximos')
  getProximos(@Query('dias') dias?: number) {
    return this.service.getProximos(dias ? +dias : 7);
  }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Patch(':id/cancelar')
  @Roles('admin', 'tesoreria')
  cancelar(@Param('id') id: string) { return this.service.cancelar(id); }
}
