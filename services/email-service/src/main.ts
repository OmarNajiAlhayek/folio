import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { RabbitMqConnection } from './amqp/rabbitmq.connection';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  const logger = new Logger('EmailService');

  // Run migrations on startup so a fresh schema is created with the
  // expected tables before any handler queries them.
  const dataSource = app.get(DataSource);
  try {
    await dataSource.query('CREATE SCHEMA IF NOT EXISTS "email"');
    await dataSource.runMigrations();
  } catch (err) {
    logger.error(
      `migration run failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const rabbit = app.get(RabbitMqConnection);
  await rabbit.connect();

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
