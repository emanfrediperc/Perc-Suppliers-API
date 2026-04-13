import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Factura, FacturaSchema } from './schemas/factura.schema';
import { Pago, PagoSchema } from '../pago/schemas/pago.schema';
import { OrdenPago, OrdenPagoSchema } from '../orden-pago/schemas/orden-pago.schema';
import { Convenio, ConvenioSchema } from '../convenio/schemas/convenio.schema';
import { EmpresaProveedora, EmpresaProveedoraSchema } from '../empresa-proveedora/schemas/empresa-proveedora.schema';
import { EmpresaCliente, EmpresaClienteSchema } from '../empresa-cliente/schemas/empresa-cliente.schema';
import { User, UserSchema } from '../../auth/schemas/user.schema';
import { FacturaController } from './factura.controller';
import { FacturaService } from './factura.service';
import { FacturaCronService } from './factura-cron.service';
import { ExportService } from '../../common/services/export.service';
import { PagoCalculatorService } from '../../common/services/pago-calculator.service';

@Module({
  imports: [MongooseModule.forFeature([
    { name: Factura.name, schema: FacturaSchema }, { name: Pago.name, schema: PagoSchema },
    { name: OrdenPago.name, schema: OrdenPagoSchema }, { name: Convenio.name, schema: ConvenioSchema },
    { name: EmpresaProveedora.name, schema: EmpresaProveedoraSchema },
    { name: EmpresaCliente.name, schema: EmpresaClienteSchema },
    { name: User.name, schema: UserSchema },
  ])],
  controllers: [FacturaController],
  providers: [FacturaService, FacturaCronService, ExportService, PagoCalculatorService],
  exports: [FacturaService],
})
export class FacturaModule {}
