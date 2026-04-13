import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Prestamo, PrestamoSchema } from './schemas/prestamo.schema';
import { PrestamosController } from './prestamos.controller';
import { PrestamosService } from './prestamos.service';
import { PrestamosDashboardController } from './prestamos-dashboard.controller';
import { PrestamosDashboardService } from './prestamos-dashboard.service';
import { EmpresaProveedoraModule } from '../empresa-proveedora/empresa-proveedora.module';
import { EmpresaClienteModule } from '../empresa-cliente/empresa-cliente.module';
import { ExportService } from '../../common/services/export.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Prestamo.name, schema: PrestamoSchema }]),
    EmpresaProveedoraModule,
    EmpresaClienteModule,
  ],
  controllers: [PrestamosController, PrestamosDashboardController],
  providers: [PrestamosService, PrestamosDashboardService, ExportService],
  exports: [PrestamosService, MongooseModule],
})
export class PrestamosModule {}
