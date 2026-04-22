import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Pago, PagoSchema } from './schemas/pago.schema';
import { Factura, FacturaSchema } from '../factura/schemas/factura.schema';
import { OrdenPago, OrdenPagoSchema } from '../orden-pago/schemas/orden-pago.schema';
import { PagoController } from './pago.controller';
import { PagoService } from './pago.service';
import { PagoAprobacionListener } from './pago-aprobacion.listener';

@Module({
  imports: [MongooseModule.forFeature([
    { name: Pago.name, schema: PagoSchema },
    { name: Factura.name, schema: FacturaSchema },
    { name: OrdenPago.name, schema: OrdenPagoSchema },
  ])],
  // AprobacionModule es @Global() — AprobacionService disponible sin importarlo explícitamente.
  controllers: [PagoController],
  providers: [PagoService, PagoAprobacionListener],
  exports: [PagoService],
})
export class PagoModule {}
