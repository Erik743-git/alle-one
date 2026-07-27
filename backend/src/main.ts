import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function listenWithFallback(
  app: { listen: (port: number) => Promise<unknown> },
  startPort: number,
  maxAttempts: number,
) {
  let port = startPort;

  for (let attempt = 0; attempt < Math.max(1, maxAttempts); attempt += 1) {
    try {
      await app.listen(port);
      return port;
    } catch (err) {
      const e = err as { code?: string } | null;
      if (e?.code !== 'EADDRINUSE') {
        throw err;
      }
      port += 1;
    }
  }

  throw new Error(
    `Não foi possível subir o servidor: portas ${startPort}..${
      startPort + Math.max(1, maxAttempts) - 1
    } em uso.`,
  );
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const isProd = process.env.NODE_ENV === 'production';

  if (process.env.TRUST_PROXY === '1') {
    const adapter = app.getHttpAdapter().getInstance() as {
      set?: (k: string, v: unknown) => void;
    };
    adapter.set?.('trust proxy', 1);
  }

  const apiPrefix = process.env.API_GLOBAL_PREFIX?.trim().replace(/^\/+|\/+$/g, '');
  if (apiPrefix) {
    app.setGlobalPrefix(apiPrefix);
  }

  app.use(cookieParser());
  app.use(helmet());
  app.useGlobalFilters(new GlobalExceptionFilter());

  const corsOriginsRaw =
    process.env.CORS_ORIGINS ?? process.env.FRONTEND_URL ?? '';
  const origins = corsOriginsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins.length ? origins : false,
    credentials: true,
    exposedHeaders: ['Content-Disposition'],
  });

  if (isProd && !origins.length) {
    throw new Error(
      'Em produção defina CORS_ORIGINS (lista separada por vírgula) ou FRONTEND_URL com a origem exata do site.',
    );
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerEnabled = !isProd || process.env.SWAGGER_ENABLED === 'true';
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Alle One API')
      .setDescription('API do portal SaaS corporativo Alle One')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  if (isProd && process.env.TIFLUX_UNSAFE_ENDPOINTS === 'true') {
    throw new Error(
      'TIFLUX_UNSAFE_ENDPOINTS=true é proibido em produção. Remova ou defina false.',
    );
  }

  const basePort = Number(process.env.PORT) || 3003;
  const maxAttempts = Number(process.env.PORT_FALLBACK_ATTEMPTS) || 25;
  const port = await listenWithFallback(app, basePort, maxAttempts);

  if (port !== basePort) {
    console.log(
      `PORTA_EM_USO: ${basePort} estava ocupada; API subiu na porta ${port}.`,
    );
  }
}

void bootstrap();
