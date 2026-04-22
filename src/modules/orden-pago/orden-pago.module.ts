import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrdenPago, OrdenPagoSchema } from './schemas/orden-pago.schema';
import { Factura, FacturaSchema } from '../factura/schemas/factura.schema';
import { Pago, PagoSchema } from '../pago/schemas/pago.schema';
import { Convenio, ConvenioSchema } from '../convenio/schemas/convenio.schema';
import { OrdenPagoController } from './orden-pago.controller';
import { OrdenPagoService } from './orden-pago.service';
import { OrdenPagoAprobacionListener } from './orden-pago-aprobacion.listener';
import { ExportService } from '../../common/services/export.service';
import { PagoCalculatorService } from '../../common/services/pago-calculator.service';
import { EmpresaProveedoraModule } from '../empresa-proveedora/empresa-proveedora.module';
import { EmpresaClienteModule } from '../empresa-cliente/empresa-cliente.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OrdenPago.name, schema: OrdenPagoSchema },
      { name: Factura.name, schema: FacturaSchema },
      { name: Pago.name, schema: PagoSchema },
      { name: Convenio.name, schema: ConvenioSchema },
    ]),
    EmpresaProveedoraModule, EmpresaClienteModule,
  ],
  controllers: [OrdenPagoController],
  // AprobacionModule es @Global() — AprobacionService disponible sin importarlo explícitamente.
  providers: [OrdenPagoService, ExportService, PagoCalculatorService, OrdenPagoAprobacionListener],
  exports: [OrdenPagoService, MongooseModule],
})
export class OrdenPagoModule {}
