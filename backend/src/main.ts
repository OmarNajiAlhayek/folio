import { BadRequestException, Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import {
  RuntimeConfigError,
  validateBackendRuntimeConfig,
} from './common/validate-runtime-config';

const DEFAULT_DEV_FRONTEND_ORIGINS = [
  'http://localhost:5240',
  'http://127.0.0.1:5240',
];

function corsOriginsFromEnv(raw: string | undefined): string | string[] {
  if (raw == null || raw.trim() === '') {
    return DEFAULT_DEV_FRONTEND_ORIGINS;
  }
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) {
    return DEFAULT_DEV_FRONTEND_ORIGINS;
  }
  return parts.length === 1 ? parts[0]! : parts;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  try {
    validateBackendRuntimeConfig(config);
  } catch (err) {
    const message =
      err instanceof RuntimeConfigError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    logger.error(`Configuration invalid: ${message}`);
    process.exit(1);
  }

  app.setGlobalPrefix('api/v1');

  const nodeEnv =
    config.get<string>('NODE_ENV') ?? process.env.NODE_ENV ?? 'development';

  if (nodeEnv === 'production') {
    const http = app.getHttpAdapter().getInstance() as {
      set: (key: string, value: number) => void;
    };
    http.set('trust proxy', 1);
  }

  app.use(cookieParser());
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      hsts: nodeEnv === 'production',
    }),
  );

  app.enableCors({
    origin: corsOriginsFromEnv(config.get<string>('FRONTEND_ORIGIN')),
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Folio-Locale',
      'X-CSRF-Token',
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        const messages = errors.flatMap((e) =>
          e.constraints ? Object.values(e.constraints) : [],
        );
        return new BadRequestException({
          message: messages.join('; ') || 'Validation failed',
          code: 'VALIDATION_ERROR',
        });
      },
    }),
  );

  const port = parseInt(config.get<string>('PORT', '5243'), 10);
  const swaggerEnabled =
    config.get<string>('SWAGGER_ENABLED') === 'true' ||
    nodeEnv !== 'production';

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Folio API')
      .setDescription(
        'Manuscript submission and peer-review REST API. OpenAPI JSON: /api-docs-json',
      )
      .setVersion('0.0.1')
      .addServer(`http://localhost:${port}`, 'Local')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
        'JWT',
      )
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api-docs', app, document);
  }

  await app.listen(port);
  const baseUrl = await app.getUrl();
  logger.log(
    `Application is listening on port ${port} — API base: ${baseUrl}/api/v1`,
  );
}
void bootstrap();
