import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { BusquedaService } from './busqueda.service';

@ApiTags('Busqueda')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('busqueda')
export class BusquedaController {
  constructor(private readonly service: BusquedaService) {}

  @Get()
  search(
    @Query('q') query: string,
    @Query('limit') limit?: number,
    @Query('page') page?: number,
    @Query('type') type?: string,
  ) {
    return this.service.search(query, { limit: limit ? +limit : undefined, page: page ? +page : undefined, type });
  }
}
