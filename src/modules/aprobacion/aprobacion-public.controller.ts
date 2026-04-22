import {
  Controller,
  Post,
  Body,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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
  @ApiOperation({
    summary: 'Decidir una aprobación vía magic-link token (público)',
    description:
      'Endpoint público (sin JWT) usado por el frontend al recibir el usuario un link por email. ' +
      'Valida el token, registra la decisión, y marca el token como usado. ' +
      'Rate-limited a 10 req/min por IP. Devuelve 503 si ENABLE_MAGIC_LINK=false.',
  })
  @ApiResponse({
    status: 200,
    description: 'Decisión registrada',
    schema: { example: { mensaje: 'Decisión registrada', estadoAprobacion: 'aprobada' } },
  })
  @ApiResponse({ status: 400, description: 'Body inválido (class-validator)' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado (mensaje genérico, no filtra si existe)' })
  @ApiResponse({ status: 429, description: 'Rate limit excedido' })
  @ApiResponse({ status: 503, description: 'Funcionalidad deshabilitada (ENABLE_MAGIC_LINK=false)' })
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
