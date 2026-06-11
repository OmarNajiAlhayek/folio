import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { initTelemetry, shutdownTelemetry } from '@folio/nest-observability';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import {
  RuntimeConfigError,
  validateEmailServiceRuntimeConfig,
} from './common/validate-runtime-config';

async function bootstrap(): Promise<void> {
  initTelemetry({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'folio-email-service',
  });

  try {
    validateEmailServiceRuntimeConfig();
  } catch (err) {
    const message =
      err instanceof RuntimeConfigError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    // eslint-disable-next-line no-console
    console.error(`Configuration invalid: ${message}`);
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const logger = app.get(Logger);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const dataSource = app.get(DataSource);
  try {
    await dataSource.query('CREATE SCHEMA IF NOT EXISTS "email"');
    await dataSource.runMigrations();
  } catch (err) {
    logger.error(
      `migration run failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    await app.close();
    process.exit(1);
  }

  const bindHost = (
    process.env.HTTP_BIND_HOST ??
    process.env.HEALTH_BIND_HOST ??
    '127.0.0.1'
  ).trim();
  const port = parseInt(
    process.env.HTTP_PORT ?? process.env.HEALTH_PORT ?? '5244',
    10,
  );
  await app.listen(port, bindHost);
  logger.log(
    `email-service listening on ${bindHost}:${port} (/health, /ready, /internal/*)`,
  );

  const shutdown = async () => {
    await app.close();
    await shutdownTelemetry();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

void bootstrap();
