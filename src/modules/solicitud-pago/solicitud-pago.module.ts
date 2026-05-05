import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SolicitudPago, SolicitudPagoSchema } from './schemas/solicitud-pago.schema';
import { Factura, FacturaSchema } from '../factura/schemas/factura.schema';
import { Pago, PagoSchema } from '../pago/schemas/pago.schema';
import { Convenio, ConvenioSchema } from '../convenio/schemas/convenio.schema';
import { SolicitudPagoService } from './solicitud-pago.service';
import { SolicitudPagoController } from './solicitud-pago.controller';
import { StorageModule } from '../../integrations/storage/storage.module';
import { PagoCalculatorService } from '../../common/services/pago-calculator.service';

@Module({
  imports: [
    StorageModule,
    MongooseModule.forFeature([
      { name: SolicitudPago.name, schema: SolicitudPagoSchema },
      { name: Factura.name, schema: FacturaSchema },
      { name: Pago.name, schema: PagoSchema },
      { name: Convenio.name, schema: ConvenioSchema },
    ]),
  ],
  controllers: [SolicitudPagoController],
  providers: [SolicitudPagoService, PagoCalculatorService],
  exports: [SolicitudPagoService],
})
export class SolicitudPagoModule {}
