import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Configuracion, ConfiguracionSchema } from './schemas/configuracion.schema';
import { ConfiguracionController } from './configuracion.controller';
import { ConfiguracionService } from './configuracion.service';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: Configuracion.name, schema: ConfiguracionSchema }])],
  controllers: [ConfiguracionController],
  providers: [ConfiguracionService],
  exports: [ConfiguracionService],
})
export class ConfiguracionModule {}
