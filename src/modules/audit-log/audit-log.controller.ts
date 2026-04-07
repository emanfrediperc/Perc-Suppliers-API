import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { AuditLogService } from './audit-log.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly service: AuditLogService) {}

  @Get()
  @Roles('admin')
  findAll(@Query() query: AuditLogQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':entidad/:entidadId')
  findByEntity(@Param('entidad') entidad: string, @Param('entidadId') entidadId: string) {
    return this.service.findByEntity(entidad, entidadId);
  }
}
