import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Notificacion, NotificacionSchema } from './schemas/notificacion.schema';
import { User, UserSchema } from '../../auth/schemas/user.schema';
import { Factura, FacturaSchema } from '../factura/schemas/factura.schema';
import { NotificacionService } from './notificacion.service';
import { NotificacionController } from './notificacion.controller';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notificacion.name, schema: NotificacionSchema },
      { name: User.name, schema: UserSchema },
      { name: Factura.name, schema: FacturaSchema },
    ]),
  ],
  controllers: [NotificacionController],
  providers: [NotificacionService],
  exports: [NotificacionService],
})
export class NotificacionModule {}
