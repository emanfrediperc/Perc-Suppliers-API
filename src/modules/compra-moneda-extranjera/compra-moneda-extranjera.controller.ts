import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CompraMonedaExtranjeraService } from './compra-moneda-extranjera.service';
import { CreateCompraMonedaExtranjeraDto } from './dto/create-compra-moneda-extranjera.dto';
import { QueryComprasMonedaExtranjeraDto } from './dto/query-compras-moneda-extranjera.dto';
import { AnularCompraMonedaExtranjeraDto } from './dto/anular-compra-moneda-extranjera.dto';
import { EjecutarCompraMonedaExtranjeraDto } from './dto/ejecutar-compra-moneda-extranjera.dto';
import { EstimarEjecucionCompraMonedaExtranjeraDto } from './dto/estimar-ejecucion-compra-moneda-extranjera.dto';

@ApiTags('CompraMonedaExtranjera')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('compras-divisas')
export class CompraMonedaExtranjeraController {
  constructor(private readonly service: CompraMonedaExtranjeraService) {}

  @Get()
  @Roles('admin', 'tesoreria', 'operador', 'consulta')
  findAll(@Query() query: QueryComprasMonedaExtranjeraDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Roles('admin', 'tesoreria', 'operador', 'consulta')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles('admin', 'tesoreria')
  @HttpCode(201)
  create(@Body() dto: CreateCompraMonedaExtranjeraDto, @Req() req: any) {
    return this.service.create(dto, { userId: req.user.userId, email: req.user.email });
  }

  @Patch(':id/anular')
  @Roles('admin', 'operador')
  anular(
    @Param('id') id: string,
    @Body() dto: AnularCompraMonedaExtranjeraDto,
    @Req() req: any,
  ) {
    return this.service.anular(id, dto, req.user.userId);
  }

  @Patch(':id/ejecutar')
  @Roles('operador')
  ejecutar(
    @Param('id') id: string,
    @Body() dto: EjecutarCompraMonedaExtranjeraDto,
    @Req() req: any,
  ) {
    return this.service.ejecutar(id, dto, req.user.userId);
  }

  @Patch(':id/estimar-ejecucion')
  @Roles('operador')
  estimarEjecucion(
    @Param('id') id: string,
    @Body() dto: EstimarEjecucionCompraMonedaExtranjeraDto,
  ) {
    return this.service.estimarEjecucion(id, dto);
  }
}
