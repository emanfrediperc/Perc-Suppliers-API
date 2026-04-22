import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('summary')
  @Roles('admin', 'tesoreria', 'operador', 'consulta')
  getSummary(@Query() dto: DashboardQueryDto) { return this.service.getSummary(dto); }

  @Get('recent-activity')
  @Roles('admin', 'tesoreria', 'operador', 'consulta')
  getRecentActivity() { return this.service.getRecentActivity(); }

  @Get('pagos-por-mes')
  @Roles('admin', 'tesoreria', 'operador', 'consulta')
  getPagosPorMes() { return this.service.getPagosPorMes(); }

  @Get('facturas-por-estado')
  @Roles('admin', 'tesoreria', 'operador', 'consulta')
  getFacturasPorEstado() { return this.service.getFacturasPorEstado(); }

  @Get('top-proveedores')
  @Roles('admin', 'tesoreria', 'operador', 'consulta')
  getTopProveedores(@Query() dto: DashboardQueryDto) { return this.service.getTopProveedores(dto); }

  @Get('facturas-por-vencer')
  @Roles('admin', 'tesoreria', 'operador', 'consulta')
  getFacturasPorVencer() { return this.service.getFacturasPorVencer(); }

  /**
   * Counts de "cosas aprobadas listas para ejecutar" para el operador.
   * Usado por el sidebar del webapp para mostrar badges por módulo.
   */
  @Get('operador-counts')
  @Roles('admin', 'operador')
  getOperadorCounts() { return this.service.getOperadorCounts(); }
}
