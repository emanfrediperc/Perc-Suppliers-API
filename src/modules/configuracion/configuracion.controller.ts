import { Controller, Get, Put, Param, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ConfiguracionService } from './configuracion.service';

@ApiTags('Configuracion')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('configuracion')
export class ConfiguracionController {
  constructor(private readonly service: ConfiguracionService) {}

  @Get()
  @Roles('admin')
  getAll() {
    return this.service.getAll();
  }

  @Get(':clave')
  @Roles('admin')
  get(@Param('clave') clave: string) {
    return this.service.get(clave);
  }

  @Put(':clave')
  @Roles('admin')
  set(@Param('clave') clave: string, @Body() body: { valor: Record<string, any>; descripcion?: string }) {
    return this.service.set(clave, body.valor, body.descripcion);
  }
}
