import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { isSwaggerEnabled } from './common/utils/swagger-gate.util';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Detrás de ALB + CloudFront el cliente real está a N hops. Confiar en un número
  // ACOTADO de proxies (no `true`) hace que req.ip use el X-Forwarded-For correcto
  // sin que un cliente pueda spoofearlo. Configurable vía TRUST_PROXY_HOPS.
  const trustProxyHops =
    app.get(ConfigService).get<number>('forensics.trustProxyHops') ?? 2;
  app.set('trust proxy', trustProxyHops);

  // HSTS explícito: fuerza HTTPS por 1 año (solo surte efecto sobre TLS; inocuo en dev HTTP).
  app.use(
    helmet({
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    }),
  );

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

  // Gate de Swagger por ALLOW-LIST (fail-closed) — ver isSwaggerEnabled().
  // Antes era `!isProduction || swaggerEnabled`, que dependia de NODE_ENV='production'
  // para apagarse; pero el deploy real NUNCA setea NODE_ENV, asi que el gate fallaba
  // ABIERTO y exponia /api/docs anonimamente. Ahora Swagger SOLO se monta con opt-in
  // explicito (SWAGGER_ENABLED=1) o en un entorno de desarrollo declarado.
  if (isSwaggerEnabled(process.env)) {
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
    console.log('Swagger UI disabled (set SWAGGER_ENABLED=1 to enable)');
  }

  const port = process.env.PORT || 3100;
  await app.listen(port);
  console.log(`Application running on: http://localhost:${port}`);
}
bootstrap();
