import { Controller, Get, Patch, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { NotificacionService } from './notificacion.service';

@ApiTags('Notificaciones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notificaciones')
export class NotificacionController {
  constructor(private readonly service: NotificacionService) {}

  @Get()
  findMyNotifications(@CurrentUser() user: any) {
    return this.service.findByUser(user.userId);
  }

  @Get('count')
  countUnread(@CurrentUser() user: any) {
    return this.service.countUnread(user.userId);
  }

  @Patch(':id/leer')
  markAsRead(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.markAsRead(id, user.userId);
  }

  @Patch('leer-todas')
  markAllAsRead(@CurrentUser() user: any) {
    return this.service.markAllAsRead(user.userId);
  }
}
