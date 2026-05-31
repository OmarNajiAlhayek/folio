import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { RabbitMqConnection } from './amqp/rabbitmq.connection';
import {
  RuntimeConfigError,
  validateEmailServiceRuntimeConfig,
} from './common/validate-runtime-config';
import { startHealthServer } from './health/health.server';

async function bootstrap(): Promise<void> {
  const logger = new Logger('EmailService');

  try {
    validateEmailServiceRuntimeConfig();
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

  const app = await NestFactory.createApplicationContext(AppModule);

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

  const rabbit = app.get(RabbitMqConnection);
  await rabbit.connect();

  const healthHost = (process.env.HEALTH_BIND_HOST ?? '127.0.0.1').trim();
  const healthPort = parseInt(process.env.HEALTH_PORT ?? '5244', 10);
  startHealthServer(healthPort, async () => {
    let dbOk = false;
    try {
      await dataSource.query('SELECT 1');
      dbOk = true;
    } catch {
      dbOk = false;
    }
    const amqpOk = rabbit.isConnected();
    const checks = { database: dbOk, amqp: amqpOk };
    return { ok: dbOk && amqpOk, checks };
  }, healthHost);
  logger.log(
    `health listening on ${healthHost}:${healthPort} (/health, /ready)`,
  );

  const shutdown = async () => {
    logger.log('shutting down email-service');
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  logger.log('email-service ready');
}

void bootstrap();
