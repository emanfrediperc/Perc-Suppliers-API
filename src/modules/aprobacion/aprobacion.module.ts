import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { Aprobacion, AprobacionSchema } from './schemas/aprobacion.schema';
import { AprobacionToken, AprobacionTokenSchema } from './schemas/aprobacion-token.schema';
import { AprobacionService } from './aprobacion.service';
import { AprobacionTokenService } from './aprobacion-token.service';
import { AprobacionController } from './aprobacion.controller';
import { AprobacionPublicController } from './aprobacion-public.controller';
import { ExportService } from '../../common/services/export.service';
import { User, UserSchema } from '../../auth/schemas/user.schema';

@Global()
@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: Aprobacion.name, schema: AprobacionSchema },
      { name: AprobacionToken.name, schema: AprobacionTokenSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AprobacionController, AprobacionPublicController],
  providers: [AprobacionService, AprobacionTokenService, ExportService],
  exports: [AprobacionService, AprobacionTokenService],
})
export class AprobacionModule {}
