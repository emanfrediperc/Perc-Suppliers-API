import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AfipModule } from '../../integrations/afip/afip.module';
import { ApocrifosModule } from '../../integrations/apocrifos/apocrifos.module';
import { IntegrationsStatusController } from './integrations-status.controller';

@Module({
  imports: [ConfigModule, AfipModule, ApocrifosModule],
  controllers: [IntegrationsStatusController],
})
export class IntegrationsStatusModule {}
