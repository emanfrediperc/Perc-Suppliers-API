import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrdenPago, OrdenPagoSchema } from '../orden-pago/schemas/orden-pago.schema';
import { Factura, FacturaSchema } from '../factura/schemas/factura.schema';
import { EmpresaProveedora, EmpresaProveedoraSchema } from '../empresa-proveedora/schemas/empresa-proveedora.schema';
import { EmpresaCliente, EmpresaClienteSchema } from '../empresa-cliente/schemas/empresa-cliente.schema';
import { BusquedaService } from './busqueda.service';
import { BusquedaController } from './busqueda.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OrdenPago.name, schema: OrdenPagoSchema },
      { name: Factura.name, schema: FacturaSchema },
      { name: EmpresaProveedora.name, schema: EmpresaProveedoraSchema },
      { name: EmpresaCliente.name, schema: EmpresaClienteSchema },
    ]),
  ],
  controllers: [BusquedaController],
  providers: [BusquedaService],
})
export class BusquedaModule {}
