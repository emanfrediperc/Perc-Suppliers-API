import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SolicitudPago, SolicitudPagoSchema } from './schemas/solicitud-pago.schema';
import { Factura, FacturaSchema } from '../factura/schemas/factura.schema';
import { SolicitudPagoService } from './solicitud-pago.service';
import { SolicitudPagoController } from './solicitud-pago.controller';
import { StorageModule } from '../../integrations/storage/storage.module';

@Module({
  imports: [
    StorageModule,
    MongooseModule.forFeature([
      { name: SolicitudPago.name, schema: SolicitudPagoSchema },
      { name: Factura.name, schema: FacturaSchema },
    ]),
  ],
  controllers: [SolicitudPagoController],
  providers: [SolicitudPagoService],
  exports: [SolicitudPagoService],
})
export class SolicitudPagoModule {}
