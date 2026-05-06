import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrdenPago, OrdenPagoSchema } from '../orden-pago/schemas/orden-pago.schema';
import { Factura, FacturaSchema } from '../factura/schemas/factura.schema';
import { Pago, PagoSchema } from '../pago/schemas/pago.schema';
import { EmpresaProveedora, EmpresaProveedoraSchema } from '../empresa-proveedora/schemas/empresa-proveedora.schema';
import { Prestamo, PrestamoSchema } from '../prestamos/schemas/prestamo.schema';
import { CompraMonedaExtranjera, CompraMonedaExtranjeraSchema } from '../compra-moneda-extranjera/schemas/compra-moneda-extranjera.schema';
import { SolicitudPago, SolicitudPagoSchema } from '../solicitud-pago/schemas/solicitud-pago.schema';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [MongooseModule.forFeature([
    { name: OrdenPago.name, schema: OrdenPagoSchema },
    { name: Factura.name, schema: FacturaSchema },
    { name: Pago.name, schema: PagoSchema },
    { name: EmpresaProveedora.name, schema: EmpresaProveedoraSchema },
    { name: Prestamo.name, schema: PrestamoSchema },
    { name: CompraMonedaExtranjera.name, schema: CompraMonedaExtranjeraSchema },
    { name: SolicitudPago.name, schema: SolicitudPagoSchema },
  ])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
