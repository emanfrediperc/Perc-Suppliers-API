import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmpresaProveedora, EmpresaProveedoraSchema } from './schemas/empresa-proveedora.schema';
import { EmpresaProveedoraController } from './empresa-proveedora.controller';
import { EmpresaProveedoraService } from './empresa-proveedora.service';
import { AfipModule } from '../../integrations/afip/afip.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: EmpresaProveedora.name, schema: EmpresaProveedoraSchema }]),
    AfipModule,
  ],
  controllers: [EmpresaProveedoraController],
  providers: [EmpresaProveedoraService],
  exports: [EmpresaProveedoraService, MongooseModule],
})
export class EmpresaProveedoraModule {}
