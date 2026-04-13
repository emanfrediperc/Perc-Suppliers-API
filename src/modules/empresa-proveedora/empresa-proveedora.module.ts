import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmpresaProveedora, EmpresaProveedoraSchema } from './schemas/empresa-proveedora.schema';
import { EmpresaProveedoraController } from './empresa-proveedora.controller';
import { EmpresaProveedoraService } from './empresa-proveedora.service';
import { AfipModule } from '../../integrations/afip/afip.module';
import { ExportService } from '../../common/services/export.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: EmpresaProveedora.name, schema: EmpresaProveedoraSchema }]),
    AfipModule,
  ],
  controllers: [EmpresaProveedoraController],
  providers: [EmpresaProveedoraService, ExportService],
  exports: [EmpresaProveedoraService, MongooseModule],
})
export class EmpresaProveedoraModule {}
