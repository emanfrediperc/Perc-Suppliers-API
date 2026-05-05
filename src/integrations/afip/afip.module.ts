import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AfipService } from './afip.service';
import { WsaaClient } from './wsaa.client';
import { PadronA5Client } from './padron-a5.client';

@Module({
  imports: [ConfigModule],
  providers: [AfipService, WsaaClient, PadronA5Client],
  exports: [AfipService],
})
export class AfipModule {}
