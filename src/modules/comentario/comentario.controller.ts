import { Controller, Get, Post, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ComentarioService } from './comentario.service';
import { CreateComentarioDto } from './dto/create-comentario.dto';

@ApiTags('Comentarios')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('comentarios')
export class ComentarioController {
  constructor(private readonly service: ComentarioService) {}

  @Get()
  findByEntidad(@Query('entidad') entidad: string, @Query('entidadId') entidadId: string) {
    return this.service.findByEntidad(entidad, entidadId);
  }

  @Post()
  create(@Body() dto: CreateComentarioDto, @Req() req: any) {
    const user = req.user;
    return this.service.create(dto, {
      email: user.email,
      nombre: `${user.nombre} ${user.apellido}`.trim(),
    });
  }

  @Delete(':id')
  @Roles('admin')
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
