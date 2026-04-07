import { Module, Global, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FinnegansMockService } from './finnegans-mock.service';
import { FinnegansRealService } from './finnegans-real.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'FINNEGANS_SERVICE',
      useFactory: (configService: ConfigService) => {
        const baseUrl = configService.get<string>('finnegans.baseUrl');
        const clientId = configService.get<string>('finnegans.clientId');
        if (baseUrl && clientId) {
          new Logger('FinnegansModule').log('Using REAL Finnegans service');
          return new FinnegansRealService(configService);
        }
        new Logger('FinnegansModule').warn('Finnegans credentials not configured — using MOCK service');
        return new FinnegansMockService();
      },
      inject: [ConfigService],
    },
  ],
  exports: ['FINNEGANS_SERVICE'],
})
export class FinnegansModule {}
