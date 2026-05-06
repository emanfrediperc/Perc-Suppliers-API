import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Convenio, ConvenioSchema } from './schemas/convenio.schema';
import { ConvenioController } from './convenio.controller';
import { ConvenioService } from './convenio.service';
import { EmpresaProveedoraModule } from '../empresa-proveedora/empresa-proveedora.module';
import { EmpresaProveedora, EmpresaProveedoraSchema } from '../empresa-proveedora/schemas/empresa-proveedora.schema';
import { Factura, FacturaSchema } from '../factura/schemas/factura.schema';
import { Pago, PagoSchema } from '../pago/schemas/pago.schema';
import { ExportService } from '../../common/services/export.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Convenio.name, schema: ConvenioSchema },
      { name: EmpresaProveedora.name, schema: EmpresaProveedoraSchema },
      { name: Factura.name, schema: FacturaSchema },
      { name: Pago.name, schema: PagoSchema },
    ]),
    EmpresaProveedoraModule,
  ],
  controllers: [ConvenioController],
  providers: [ConvenioService, ExportService],
  exports: [ConvenioService, MongooseModule],
})
export class ConvenioModule {}
