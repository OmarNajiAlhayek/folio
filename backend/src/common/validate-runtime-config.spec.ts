import { ConfigService } from '@nestjs/config';
import {
  assertBackendDoesNotConfigureMail,
  isLocalDevSandbox,
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

  it('rejects staging with example secrets even when NODE_ENV is not production', () => {
    const config = configFromEnv({
      NODE_ENV: 'staging',
      JWT_SECRET: 'change_this_to_a_long_random_secret',
      DB_PASSWORD: 'changeme',
      RABBITMQ_URL: 'amqp://folio:secret@broker:5672',
      AUTH_COOKIE_SECURE: 'true',
    });
    expect(isLocalDevSandbox(config)).toBe(false);
    expect(() => validateBackendRuntimeConfig(config)).toThrow(RuntimeConfigError);
  });

  it('rejects deploy-shaped config when NODE_ENV is omitted but secrets are still examples', () => {
    const config = configFromEnv({
      JWT_SECRET: 'change_this_to_a_long_random_secret',
      DB_PASSWORD: 'changeme',
      DB_HOST: 'db.prod.example',
      RABBITMQ_URL: 'amqp://folio:secret@broker.example:5672',
      FRONTEND_ORIGIN: 'https://journal.example.com',
      APP_BASE_URL: 'https://journal.example.com',
      AUTH_COOKIE_SECURE: 'true',
    });
    expect(isLocalDevSandbox(config)).toBe(false);
    expect(() => validateBackendRuntimeConfig(config)).toThrow(RuntimeConfigError);
  });

  it('rejects when AUTH_COOKIE_SECURE is true but NODE_ENV is still development', () => {
    const config = configFromEnv({
      NODE_ENV: 'development',
      JWT_SECRET: 'change_this_to_a_long_random_secret',
      DB_PASSWORD: 'changeme',
      AUTH_COOKIE_SECURE: 'true',
    });
    expect(isLocalDevSandbox(config)).toBe(false);
    expect(() => validateBackendRuntimeConfig(config)).toThrow(RuntimeConfigError);
  });

  it('honors RUNTIME_CONFIG_STRICT to force checks in local-looking env', () => {
    const config = configFromEnv({
      NODE_ENV: 'development',
      RUNTIME_CONFIG_STRICT: 'true',
      JWT_SECRET: 'change_this_to_a_long_random_secret',
      DB_PASSWORD: 'changeme',
    });
    expect(isLocalDevSandbox(config)).toBe(false);
    expect(() => validateBackendRuntimeConfig(config)).toThrow(RuntimeConfigError);
  });

  it('requires gRPC host and token when AI is enabled in production', () => {
    const base = {
      NODE_ENV: 'production',
      JWT_SECRET: 'a'.repeat(32),
      DB_PASSWORD: 'real-prod-password-not-in-blocklist',
      RABBITMQ_URL: 'amqp://folio:secret@broker:5672',
      AUTH_COOKIE_SECURE: 'true',
      AI_SERVICE_ENABLED: 'true',
    };
    expect(() =>
      validateBackendRuntimeConfig(
        configFromEnv({ ...base, AI_SERVICE_GRPC_HOST: '', AI_SERVICE_TOKEN: '' }),
      ),
    ).toThrow(/AI_SERVICE_GRPC_HOST/);

    expect(() =>
      validateBackendRuntimeConfig(
        configFromEnv({
          ...base,
          AI_SERVICE_GRPC_HOST: 'ai-service',
          AI_SERVICE_TOKEN: '',
        }),
      ),
    ).toThrow(/AI_SERVICE_TOKEN/);
  });

  it('requires gRPC host when AI similarity is enabled in production', () => {
    expect(() =>
      validateBackendRuntimeConfig(
        configFromEnv({
          NODE_ENV: 'production',
          JWT_SECRET: 'a'.repeat(32),
          DB_PASSWORD: 'real-prod-password-not-in-blocklist',
          RABBITMQ_URL: 'amqp://folio:secret@broker:5672',
          AUTH_COOKIE_SECURE: 'true',
          AI_SIMILARITY_ENABLED: 'true',
          AI_SERVICE_GRPC_HOST: '',
        }),
      ),
    ).toThrow(/AI_SERVICE_GRPC_HOST/);
  });
});
