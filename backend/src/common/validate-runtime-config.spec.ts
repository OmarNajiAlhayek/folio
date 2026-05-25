import { ConfigService } from '@nestjs/config';
import {
  assertBackendDoesNotConfigureMail,
  RuntimeConfigError,
  validateBackendRuntimeConfig,
} from './validate-runtime-config';

function configFromEnv(
  env: Record<string, string | undefined>,
): ConfigService {
  return new ConfigService(env);
}

describe('validateBackendRuntimeConfig', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it('rejects mail-related env on the backend in any environment', () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    expect(() => assertBackendDoesNotConfigureMail()).toThrow(RuntimeConfigError);
    delete process.env.SMTP_HOST;
  });

  it('allows development with example JWT and DB password', () => {
    const config = configFromEnv({
      NODE_ENV: 'development',
      JWT_SECRET: 'change_this_to_a_long_random_secret',
      DB_PASSWORD: 'changeme',
    });
    expect(() => validateBackendRuntimeConfig(config)).not.toThrow();
  });

  it('rejects production with example JWT_SECRET', () => {
    const config = configFromEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'change_this_to_a_long_random_secret',
      DB_PASSWORD: 'real-prod-password-not-in-blocklist',
      RABBITMQ_URL: 'amqp://folio:secret@broker:5672',
    });
    expect(() => validateBackendRuntimeConfig(config)).toThrow(RuntimeConfigError);
  });

  it('rejects production with short JWT_SECRET', () => {
    const config = configFromEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'too-short',
      DB_PASSWORD: 'real-prod-password-not-in-blocklist',
      RABBITMQ_URL: 'amqp://folio:secret@broker:5672',
    });
    expect(() => validateBackendRuntimeConfig(config)).toThrow(RuntimeConfigError);
  });

  it('rejects production with example DB_PASSWORD', () => {
    const config = configFromEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'a'.repeat(32),
      DB_PASSWORD: 'changeme',
      RABBITMQ_URL: 'amqp://folio:secret@broker:5672',
    });
    expect(() => validateBackendRuntimeConfig(config)).toThrow(RuntimeConfigError);
  });

  it('rejects production with guest RabbitMQ credentials', () => {
    const config = configFromEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'a'.repeat(32),
      DB_PASSWORD: 'real-prod-password-not-in-blocklist',
      RABBITMQ_URL: 'amqp://guest:guest@localhost:5672',
    });
    expect(() => validateBackendRuntimeConfig(config)).toThrow(RuntimeConfigError);
  });
});
