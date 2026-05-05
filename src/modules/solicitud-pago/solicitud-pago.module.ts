import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SolicitudPago, SolicitudPagoSchema } from './schemas/solicitud-pago.schema';
import { Factura, FacturaSchema } from '../factura/schemas/factura.schema';
import { Pago, PagoSchema } from '../pago/schemas/pago.schema';
import { OrdenPago, OrdenPagoSchema } from '../orden-pago/schemas/orden-pago.schema';
import { Convenio, ConvenioSchema } from '../convenio/schemas/convenio.schema';
import { User, UserSchema } from '../../auth/schemas/user.schema';
import { SolicitudPagoService } from './solicitud-pago.service';
import { SolicitudPagoController } from './solicitud-pago.controller';
import { StorageModule } from '../../integrations/storage/storage.module';
import { EmailModule } from '../../integrations/email/email.module';
import { PagoCalculatorService } from '../../common/services/pago-calculator.service';
import { HashChainService } from './hash-chain.service';
import { TsaClient } from './tsa.client';

@Module({
  imports: [
    StorageModule,
    EmailModule,
    MongooseModule.forFeature([
      { name: SolicitudPago.name, schema: SolicitudPagoSchema },
      { name: Factura.name, schema: FacturaSchema },
      { name: Pago.name, schema: PagoSchema },
      { name: OrdenPago.name, schema: OrdenPagoSchema },
      { name: Convenio.name, schema: ConvenioSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [SolicitudPagoController],
  providers: [SolicitudPagoService, PagoCalculatorService, HashChainService, TsaClient],
  exports: [SolicitudPagoService],
})
export class SolicitudPagoModule {}
