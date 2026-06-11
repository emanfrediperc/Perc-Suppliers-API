import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Detrás de ALB + CloudFront el cliente real está a N hops. Confiar en un número
  // ACOTADO de proxies (no `true`) hace que req.ip use el X-Forwarded-For correcto
  // sin que un cliente pueda spoofearlo. Configurable vía TRUST_PROXY_HOPS.
  const trustProxyHops =
    app.get(ConfigService).get<number>('forensics.trustProxyHops') ?? 2;
  app.set('trust proxy', trustProxyHops);

  app.use(helmet());

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:4200';
  app.enableCors({
    origin: corsOrigin.split(','),
    credentials: true,
  });

  const isProduction = process.env.NODE_ENV === 'production';
  const swaggerEnabled = process.env.SWAGGER_ENABLED === '1';

  if (!isProduction || swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Perc Suppliers API')
      .setDescription('API para gestion de pagos a proveedores')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
    console.log(
      `Swagger UI: http://localhost:${process.env.PORT || 3100}/api/docs`,
    );
  } else {
    console.log('Swagger UI disabled (NODE_ENV=production)');
  }

  const port = process.env.PORT || 3100;
  await app.listen(port);
  console.log(`Application running on: http://localhost:${port}`);
}
bootstrap();
