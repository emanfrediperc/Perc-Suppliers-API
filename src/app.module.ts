import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import configuration from './config/configuration';
import { AuthModule } from './auth/auth.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { NotificacionModule } from './modules/notificacion/notificacion.module';
import { AprobacionModule } from './modules/aprobacion/aprobacion.module';
import { OrdenPagoModule } from './modules/orden-pago/orden-pago.module';
import { FacturaModule } from './modules/factura/factura.module';
import { PagoModule } from './modules/pago/pago.module';
import { ConvenioModule } from './modules/convenio/convenio.module';
import { EmpresaProveedoraModule } from './modules/empresa-proveedora/empresa-proveedora.module';
import { EmpresaClienteModule } from './modules/empresa-cliente/empresa-cliente.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ReporteModule } from './modules/reporte/reporte.module';
import { FinnegansModule } from './integrations/finnegans/finnegans.module';
import { StorageModule } from './integrations/storage/storage.module';
import { GeminiModule } from './integrations/gemini/gemini.module';
import { ScheduleModule } from '@nestjs/schedule';
import { PagoProgramadoModule } from './modules/pago-programado/pago-programado.module';
import { AfipModule } from './integrations/afip/afip.module';
import { EmailModule } from './integrations/email/email.module';
import { BusquedaModule } from './modules/busqueda/busqueda.module';
import { ComentarioModule } from './modules/comentario/comentario.module';
import { ConfiguracionModule } from './modules/configuracion/configuracion.module';
import { PrestamosModule } from './modules/prestamos/prestamos.module';
import { AuditLogInterceptor } from './modules/audit-log/audit-log.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('database.uri'),
      }),
      inject: [ConfigService],
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    AuditLogModule,
    NotificacionModule,
    AprobacionModule,
    FinnegansModule,
    StorageModule,
    GeminiModule,
    EmailModule,
    OrdenPagoModule,
    FacturaModule,
    PagoModule,
    ConvenioModule,
    EmpresaProveedoraModule,
    EmpresaClienteModule,
    DashboardModule,
    ReporteModule,
    PagoProgramadoModule,
    AfipModule,
    BusquedaModule,
    ComentarioModule,
    ConfiguracionModule,
    PrestamosModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
  ],
})
export class AppModule {}
