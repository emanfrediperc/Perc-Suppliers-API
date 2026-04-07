import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Convenio, ConvenioSchema } from './schemas/convenio.schema';
import { ConvenioController } from './convenio.controller';
import { ConvenioService } from './convenio.service';
import { EmpresaProveedoraModule } from '../empresa-proveedora/empresa-proveedora.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Convenio.name, schema: ConvenioSchema }]),
    EmpresaProveedoraModule,
  ],
  controllers: [ConvenioController],
  providers: [ConvenioService],
  exports: [ConvenioService, MongooseModule],
})
export class ConvenioModule {}
