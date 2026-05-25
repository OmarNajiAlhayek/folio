import { ConfigService } from '@nestjs/config';

/** Values from `.env.example` that must never be used in production. */
const INSECURE_JWT_SECRETS = new Set([
  '',
  'change_this_to_a_long_random_secret',
  'changeme',
  'secret',
  'jwt_secret',
  'your-secret-key',
]);

const INSECURE_DB_PASSWORDS = new Set([
  '',
  'changeme',
  'password',
  'postgres',
  '0000',
]);

const BACKEND_FORBIDDEN_MAIL_ENV = [
  'EMAIL_PROVIDER',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'EMAIL_FROM',
] as const;

const MIN_JWT_SECRET_LENGTH = 32;

export class RuntimeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeConfigError';
  }
}

function nodeEnv(config?: ConfigService): string {
  return (
    config?.get<string>('NODE_ENV') ??
    process.env.NODE_ENV ??
    'development'
  );
}

function isProduction(config?: ConfigService): boolean {
  return nodeEnv(config) === 'production';
}

/** Mail is sent only by `services/email-service`; backend env must not set SMTP. */
export function assertBackendDoesNotConfigureMail(): void {
  const found = BACKEND_FORBIDDEN_MAIL_ENV.filter((key) => {
    const value = process.env[key];
    return value != null && value.trim() !== '';
  });
  if (found.length > 0) {
    throw new RuntimeConfigError(
      `Backend must not configure outbound mail (${found.join(', ')}). ` +
        'Use services/email-service/.env for EMAIL_PROVIDER and SMTP_* only.',
    );
  }
}

export function validateBackendRuntimeConfig(config: ConfigService): void {
  assertBackendDoesNotConfigureMail();

  if (!isProduction(config)) {
    return;
  }

  const jwtSecret = config.get<string>('JWT_SECRET', '').trim();
  if (
    INSECURE_JWT_SECRETS.has(jwtSecret) ||
    jwtSecret.length < MIN_JWT_SECRET_LENGTH
  ) {
    throw new RuntimeConfigError(
      'JWT_SECRET must be a unique random string of at least 32 characters in production (not the .env.example placeholder).',
    );
  }

  const dbPassword = config.get<string>('DB_PASSWORD', '').trim();
  if (INSECURE_DB_PASSWORDS.has(dbPassword)) {
    throw new RuntimeConfigError(
      'DB_PASSWORD must be a strong secret in production (not changeme or other example defaults).',
    );
  }

  const rabbitUrl = config.get<string>('RABBITMQ_URL', '');
  if (rabbitUrl.includes('guest:guest@')) {
    throw new RuntimeConfigError(
      'RABBITMQ_URL must not use guest:guest in production.',
    );
  }

  if (config.get<string>('AUTH_COOKIE_SECURE') !== 'true') {
    throw new RuntimeConfigError(
      'AUTH_COOKIE_SECURE must be true in production (HTTPS).',
    );
  }

  for (const key of [
    'THROTTLE_TTL_MS',
    'THROTTLE_LOGIN_LIMIT',
    'THROTTLE_REGISTER_LIMIT',
  ] as const) {
    const raw = config.get<string>(key);
    if (raw != null && raw.trim() !== '') {
      const n = parseInt(raw, 10);
      if (!Number.isFinite(n) || n < 1) {
        throw new RuntimeConfigError(`${key} must be a positive integer.`);
      }
    }
  }
}
