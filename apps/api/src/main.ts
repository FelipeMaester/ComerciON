import 'reflect-metadata';
import { origemPermitida } from './common/tenant/origem-permitida';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { json } from 'express';
import { AppModule } from './app.module';
import { conferirFusoDoServidor } from './common/fuso-do-servidor';
import { confiarNoProxy } from './common/confiar-no-proxy';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // Precisa vir antes de tudo que lê `req.ip` — o limitador de requisições é
  // quem depende disso. Ver common/confiar-no-proxy.ts para o porquê.
  app.set('trust proxy', confiarNoProxy(config.get<string>('TRUST_PROXY')));

  app.use(helmet());
  // Padrão do Express (100kb) estoura fácil com a logo em base64 vinda
  // da tela de configurações — 10mb dá folga para duas imagens + overhead do JSON.
  app.use(json({ limit: '10mb' }));
  // Com uma loja por subdomínio, a origem do painel muda a cada cliente
  // (oficina-a.painel.x.com.br, oficina-b.painel.x.com.br). Uma lista fixa
  // recusaria todas menos uma. Também não dá para usar '*': o navegador
  // rejeita resposta com credencial vinda de origem curinga, e a sessão vai
  // em cookie.
  const origemFixa = config.get<string>('CORS_ORIGIN', 'http://localhost:3000');
  const dominioBase = config.get<string>('TENANT_BASE_DOMAIN');
  app.enableCors({
    origin: (origem, callback) => {
      // Sem Origin: chamada que não vem de navegador (script, curl, health
      // check). CORS não se aplica.
      if (!origem) return callback(null, true);
      callback(null, origemPermitida(origem, origemFixa, dominioBase));
    },
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

  // Antes de servir a primeira requisição: em UTC o sistema erra o dia
  // durante três horas por dia, e não avisa ninguém.
  conferirFusoDoServidor();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ComerciON API')
    .setDescription('API multi-tenant do sistema de gestão para mecânicas e lojas de auto peças')
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
