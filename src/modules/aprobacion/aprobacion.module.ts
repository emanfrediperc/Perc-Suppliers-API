import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { Aprobacion, AprobacionSchema } from './schemas/aprobacion.schema';
import {
  AprobacionToken,
  AprobacionTokenSchema,
} from './schemas/aprobacion-token.schema';
import {
  DesafioStepUp,
  DesafioStepUpSchema,
} from './schemas/desafio-step-up.schema';
import { AprobacionService } from './aprobacion.service';
import { AprobacionTokenService } from './aprobacion-token.service';
import { StepUpService } from './step-up.service';
import { AprobacionController } from './aprobacion.controller';
import { AprobacionPublicController } from './aprobacion-public.controller';
import { ExportService } from '../../common/services/export.service';
import { GeoService } from '../../common/services/geo.service';
import { CryptoModule } from '../../common/crypto.module';
import { User, UserSchema } from '../../auth/schemas/user.schema';

@Global()
@Module({
  imports: [
    ConfigModule,
    CryptoModule,
    MongooseModule.forFeature([
      { name: Aprobacion.name, schema: AprobacionSchema },
      { name: AprobacionToken.name, schema: AprobacionTokenSchema },
      { name: DesafioStepUp.name, schema: DesafioStepUpSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AprobacionController, AprobacionPublicController],
  providers: [
    AprobacionService,
    AprobacionTokenService,
    StepUpService,
    ExportService,
    GeoService,
  ],
  exports: [AprobacionService, AprobacionTokenService],
})
export class AprobacionModule {}
