import { config as loadEnv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { EmailLog } from '../email-log/email-log.entity';
import { EmailReminderPolicyEntity } from '../entities/email-reminder-policy.entity';
import { EmailTemplateEntity } from '../entities/email-template.entity';
import { Reminder } from '../reminders/reminder.entity';
import { join } from 'path';

loadEnv();

/**
 * Email-service TypeORM datasource. Pinned to the `email` schema so
 * it never collides with the backend's `public` schema. `migrationsRun`
 * is left to the bootstrap path; the CLI commands `npm run migrate`
 * and `npm run migrate:generate` use this same file.
 */
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_DATABASE ?? 'folio_email',
  schema: process.env.DB_SCHEMA ?? 'email',
  entities: [
    EmailLog,
    Reminder,
    EmailTemplateEntity,
    EmailReminderPolicyEntity,
  ],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  synchronize: false,
  extra: {
    max: parseInt(process.env.DB_POOL_MAX ?? '30', 10),
    ...(process.env.DB_POOL_IDLE_TIMEOUT_MS
      ? { idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MS, 10) }
      : {}),
    ...(process.env.DB_POOL_CONNECTION_TIMEOUT_MS
      ? {
          connectionTimeoutMillis: parseInt(
            process.env.DB_POOL_CONNECTION_TIMEOUT_MS,
            10,
          ),
        }
      : {}),
    ...(process.env.DB_STATEMENT_TIMEOUT_MS
      ? {
          options: `-c statement_timeout=${parseInt(process.env.DB_STATEMENT_TIMEOUT_MS, 10)}`,
        }
      : {}),
  },
  ...(process.env.TYPEORM_MAX_QUERY_EXECUTION_TIME_MS
    ? {
        maxQueryExecutionTime: parseInt(
          process.env.TYPEORM_MAX_QUERY_EXECUTION_TIME_MS,
          10,
        ),
        logging: ['warn' as const],
      }
    : {}),
};

export const AppDataSource = new DataSource(dataSourceOptions);
