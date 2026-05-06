import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AfipService } from '../../integrations/afip/afip.service';
import { ApocrifosService } from '../../integrations/apocrifos/apocrifos.service';
import { ConfigService } from '@nestjs/config';

@ApiTags('Integraciones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('integrations/status')
export class IntegrationsStatusController {
  constructor(
    private readonly afip: AfipService,
    private readonly apocrifos: ApocrifosService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  status() {
    return {
      afipPadron: {
        configured: this.afip.isConfigured(),
        env: this.config.get('AFIP_ENV') || 'homologacion',
      },
      apocrifos: {
        configured: this.apocrifos.isConfigured(),
      },
      email: {
        mode: this.config.get('RESEND_API_KEY')
          ? 'resend'
          : this.config.get('SMTP_HOST')
          ? 'smtp'
          : 'mock',
      },
      tsa: {
        enabled: this.config.get('TSA_ENABLED') !== 'false',
        url: this.config.get('TSA_URL') || 'https://freetsa.org/tsr',
      },
    };
  }
}
