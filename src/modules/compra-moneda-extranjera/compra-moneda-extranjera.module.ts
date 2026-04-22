import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CompraMonedaExtranjera,
  CompraMonedaExtranjeraSchema,
} from './schemas/compra-moneda-extranjera.schema';
import { CompraMonedaExtranjeraController } from './compra-moneda-extranjera.controller';
import { CompraMonedaExtranjeraService } from './compra-moneda-extranjera.service';
import { CompraMonedaExtranjeraAprobacionListener } from './compra-moneda-extranjera-aprobacion.listener';
import { EmpresaClienteModule } from '../empresa-cliente/empresa-cliente.module';
import { EmpresaProveedoraModule } from '../empresa-proveedora/empresa-proveedora.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CompraMonedaExtranjera.name, schema: CompraMonedaExtranjeraSchema },
    ]),
    EmpresaClienteModule,
    EmpresaProveedoraModule,
    // AprobacionModule es @Global() — AprobacionService disponible sin importarlo explícitamente.
  ],
  controllers: [CompraMonedaExtranjeraController],
  providers: [CompraMonedaExtranjeraService, CompraMonedaExtranjeraAprobacionListener],
  exports: [CompraMonedaExtranjeraService, MongooseModule],
})
export class CompraMonedaExtranjeraModule {}
