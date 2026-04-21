import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { PrestamosDashboardService } from './prestamos-dashboard.service';
import { DashboardFilterDto } from './dto/dashboard-filter.dto';

@ApiTags('Prestamos Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('prestamos/dashboard')
export class PrestamosDashboardController {
  constructor(private readonly service: PrestamosDashboardService) {}

  @Get('summary')
  @Roles('admin', 'tesoreria', 'operador', 'consulta')
  getSummary(@Query() filters: DashboardFilterDto) {
    return this.service.getSummary(filters);
  }

  @Get('net-position')
  @Roles('admin', 'tesoreria', 'operador', 'consulta')
  getNetPosition(@Query() filters: DashboardFilterDto) {
    return this.service.getNetPosition(filters);
  }
}
