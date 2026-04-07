import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('summary') getSummary(@Query() dto: DashboardQueryDto) { return this.service.getSummary(dto); }
  @Get('recent-activity') getRecentActivity() { return this.service.getRecentActivity(); }
  @Get('pagos-por-mes') getPagosPorMes() { return this.service.getPagosPorMes(); }
  @Get('facturas-por-estado') getFacturasPorEstado() { return this.service.getFacturasPorEstado(); }
  @Get('top-proveedores') getTopProveedores(@Query() dto: DashboardQueryDto) { return this.service.getTopProveedores(dto); }
  @Get('facturas-por-vencer') getFacturasPorVencer() { return this.service.getFacturasPorVencer(); }
}
