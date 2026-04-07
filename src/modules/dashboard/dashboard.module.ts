import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrdenPago, OrdenPagoSchema } from '../orden-pago/schemas/orden-pago.schema';
import { Factura, FacturaSchema } from '../factura/schemas/factura.schema';
import { Pago, PagoSchema } from '../pago/schemas/pago.schema';
import { EmpresaProveedora, EmpresaProveedoraSchema } from '../empresa-proveedora/schemas/empresa-proveedora.schema';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [MongooseModule.forFeature([
    { name: OrdenPago.name, schema: OrdenPagoSchema }, { name: Factura.name, schema: FacturaSchema },
    { name: Pago.name, schema: PagoSchema }, { name: EmpresaProveedora.name, schema: EmpresaProveedoraSchema },
  ])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
