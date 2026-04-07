import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Aprobacion, AprobacionSchema } from './schemas/aprobacion.schema';
import { AprobacionService } from './aprobacion.service';
import { AprobacionController } from './aprobacion.controller';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Aprobacion.name, schema: AprobacionSchema }]),
  ],
  controllers: [AprobacionController],
  providers: [AprobacionService],
  exports: [AprobacionService],
})
export class AprobacionModule {}
