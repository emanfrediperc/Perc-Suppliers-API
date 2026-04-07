import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Pago, PagoSchema } from '../pago/schemas/pago.schema';
import { Factura, FacturaSchema } from '../factura/schemas/factura.schema';
import { OrdenPago, OrdenPagoSchema } from '../orden-pago/schemas/orden-pago.schema';
import { EmpresaProveedora, EmpresaProveedoraSchema } from '../empresa-proveedora/schemas/empresa-proveedora.schema';
import { Convenio, ConvenioSchema } from '../convenio/schemas/convenio.schema';
import { ReporteController } from './reporte.controller';
import { ReporteService } from './reporte.service';
import { ExportService } from '../../common/services/export.service';

@Module({
  imports: [MongooseModule.forFeature([
    { name: Pago.name, schema: PagoSchema },
    { name: Factura.name, schema: FacturaSchema },
    { name: OrdenPago.name, schema: OrdenPagoSchema },
    { name: EmpresaProveedora.name, schema: EmpresaProveedoraSchema },
    { name: Convenio.name, schema: ConvenioSchema },
  ])],
  controllers: [ReporteController],
  providers: [ReporteService, ExportService],
})
export class ReporteModule {}
