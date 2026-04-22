import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiParam } from '@nestjs/swagger';
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

  @Get('contexto-token/:token')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({
    summary: 'Obtener contexto de una aprobación desde un magic-link token (público, read-only)',
    description:
      'Valida el token y devuelve el contexto necesario para mostrar la página de confirmación en el frontend. ' +
      'NO modifica ningún estado — es completamente idempotente. ' +
      'Rate-limited a 10 req/min por IP. Devuelve 503 si ENABLE_MAGIC_LINK=false.',
  })
  @ApiParam({ name: 'token', description: 'Raw magic-link token (base64url)' })
  @ApiResponse({
    status: 200,
    description: 'Contexto de la aprobación',
    schema: {
      example: {
        tipo: 'creacion',
        entidad: 'prestamos',
        descripcion: 'Préstamo a XYZ por $10.000',
        monto: 10000,
        solicitante: 'tesoreria@perc.com',
        fechaSolicitud: '2026-04-21T10:00:00Z',
        expiraEn: '2026-04-23T10:00:00Z',
        aprobadorEmail: 'aprobador@perc.com',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado (mensaje genérico)' })
  @ApiResponse({ status: 429, description: 'Rate limit excedido' })
  @ApiResponse({ status: 503, description: 'Funcionalidad deshabilitada' })
  async contextoToken(@Param('token') token: string) {
    if (this.configService.get<boolean>('magicLink.enabled') !== true) {
      throw new ServiceUnavailableException('Funcionalidad deshabilitada');
    }

    try {
      return await this.service.getContextoToken(token);
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }

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
