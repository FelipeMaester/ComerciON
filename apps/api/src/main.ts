import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { json } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.use(helmet());
  // Padrão do Express (100kb) estoura fácil com logo/banner em base64 vindos
  // da tela de configurações — 10mb dá folga para duas imagens + overhead do JSON.
  app.use(json({ limit: '10mb' }));
  app.enableCors({
    origin: [
      config.get<string>('CORS_ORIGIN', 'http://localhost:3000'),
      config.get<string>('STOREFRONT_CORS_ORIGIN', 'http://localhost:3002'),
    ],
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.setGlobalPrefix('api');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ComerciON API')
    .setDescription('API multi-tenant do sistema de gestão de comércios')
    .setVersion('0.0.1')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'x-tenant-slug', in: 'header' }, 'tenant')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = config.get<number>('API_PORT', 3001);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API rodando em http://localhost:${port}/api — docs em /docs`);
}

bootstrap();
