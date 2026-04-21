import {
  Controller,
  Post,
  Body,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { AprobacionService } from './aprobacion.service';
import { DecidirViaTokenDto } from './dto/decidir-via-token.dto';

/**
 * Controlador público (sin JWT) para el flujo de magic-link.
 * Al estar separado del AprobacionController (que usa @UseGuards(JwtAuthGuard, RolesGuard)
 * a nivel de clase), no se hereda ningún guard de autenticación.
 * La protección es: feature flag + throttling por IP.
 */
@ApiTags('Aprobaciones (public)')
@Controller('aprobaciones')
export class AprobacionPublicController {
  constructor(
    private readonly service: AprobacionService,
    private readonly configService: ConfigService,
  ) {}

  @Post('decidir-via-token')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async decidirViaToken(
    @Body() dto: DecidirViaTokenDto,
    @Req() req: Request,
  ) {
    // Feature flag guard — 503 si magic-link está deshabilitado
    if (this.configService.get<boolean>('magicLink.enabled') !== true) {
      throw new ServiceUnavailableException('Funcionalidad deshabilitada');
    }

    const ip = req.ip ?? 'unknown';
    const userAgent = (req.headers['user-agent'] as string) ?? 'unknown';

    try {
      const result = await this.service.decidirViaToken(
        dto.token,
        dto.decision,
        dto.comentario,
        ip,
        userAgent,
      );
      return { mensaje: 'Decisión registrada', estadoAprobacion: result.estado };
    } catch {
      // Error genérico — nunca filtrar si el token existió o no
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }
}
