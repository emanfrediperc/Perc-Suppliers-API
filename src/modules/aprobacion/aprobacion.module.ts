import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Aprobacion, AprobacionSchema } from './schemas/aprobacion.schema';
import { AprobacionToken, AprobacionTokenSchema } from './schemas/aprobacion-token.schema';
import { AprobacionService } from './aprobacion.service';
import { AprobacionTokenService } from './aprobacion-token.service';
import { AprobacionController } from './aprobacion.controller';
import { ExportService } from '../../common/services/export.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Aprobacion.name, schema: AprobacionSchema },
      { name: AprobacionToken.name, schema: AprobacionTokenSchema },
    ]),
  ],
  controllers: [AprobacionController],
  providers: [AprobacionService, AprobacionTokenService, ExportService],
  exports: [AprobacionService, AprobacionTokenService],
})
export class AprobacionModule {}
