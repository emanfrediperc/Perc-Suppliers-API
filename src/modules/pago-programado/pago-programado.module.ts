import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PagoProgramado, PagoProgramadoSchema } from './schemas/pago-programado.schema';
import { PagoProgramadoController } from './pago-programado.controller';
import { PagoProgramadoService } from './pago-programado.service';
import { OrdenPagoModule } from '../orden-pago/orden-pago.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: PagoProgramado.name, schema: PagoProgramadoSchema }]),
    OrdenPagoModule,
  ],
  controllers: [PagoProgramadoController],
  providers: [PagoProgramadoService],
})
export class PagoProgramadoModule {}
