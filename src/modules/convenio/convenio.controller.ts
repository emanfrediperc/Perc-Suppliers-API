import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ConvenioService } from './convenio.service';
import { CreateConvenioDto } from './dto/create-convenio.dto';
import { UpdateConvenioDto } from './dto/update-convenio.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@ApiTags('Convenios')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('convenios')
export class ConvenioController {
  constructor(private readonly service: ConvenioService) {}

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateConvenioDto) { return this.service.create(dto); }

  @Get() findAll(@Query() query: PaginationQueryDto) { return this.service.findAll(query); }
  @Get(':id') findOne(@Param('id') id: string) { return this.service.findOne(id); }

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
