import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmpresaCliente, EmpresaClienteSchema } from './schemas/empresa-cliente.schema';
import { EmpresaClienteController } from './empresa-cliente.controller';
import { EmpresaClienteService } from './empresa-cliente.service';
import { AfipModule } from '../../integrations/afip/afip.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: EmpresaCliente.name, schema: EmpresaClienteSchema }]),
    AfipModule,
  ],
  controllers: [EmpresaClienteController],
  providers: [EmpresaClienteService],
  exports: [EmpresaClienteService, MongooseModule],
})
export class EmpresaClienteModule {}
