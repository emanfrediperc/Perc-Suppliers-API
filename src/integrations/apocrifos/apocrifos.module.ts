import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { CacheApocrifo, CacheApocrifoSchema } from './schemas/cache-apocrifo.schema';
import { ApocrifosService } from './apocrifos.service';
import { ApocrifosClient } from './apocrifos.client';
import { TwoCaptchaClient } from './twocaptcha.client';
import { ApocrifosCronService } from './apocrifos-cron.service';
import { Factura, FacturaSchema } from '../../modules/factura/schemas/factura.schema';
import { EmpresaProveedora, EmpresaProveedoraSchema } from '../../modules/empresa-proveedora/schemas/empresa-proveedora.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: CacheApocrifo.name, schema: CacheApocrifoSchema },
      { name: Factura.name, schema: FacturaSchema },
      { name: EmpresaProveedora.name, schema: EmpresaProveedoraSchema },
    ]),
  ],
  providers: [ApocrifosService, ApocrifosClient, TwoCaptchaClient, ApocrifosCronService],
  exports: [ApocrifosService],
})
export class ApocrifosModule {}
