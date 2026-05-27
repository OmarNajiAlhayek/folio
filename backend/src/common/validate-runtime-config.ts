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

const LOCAL_DEV_NODE_ENVS = new Set(['development', 'test']);
const LOCAL_DB_HOSTS = new Set(['', 'localhost', '127.0.0.1', 'host.docker.internal']);

function nodeEnv(config?: ConfigService): string {
  return (
    config?.get<string>('NODE_ENV') ??
    process.env.NODE_ENV ??
    'development'
  )
    .trim()
    .toLowerCase();
}

function isLocalhostishUrl(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') {
    return true;
  }
  try {
    const host = new URL(trimmed).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
}

function frontendOriginsLookLocal(config: ConfigService): boolean {
  const raw = config.get<string>('FRONTEND_ORIGIN', '').trim();
  if (raw === '') {
    return true;
  }
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .every((origin) => isLocalhostishUrl(origin));
}

function rabbitMqLooksLocal(config: ConfigService): boolean {
  const url = config.get<string>('RABBITMQ_URL', '').trim();
  if (url === '') {
    return true;
  }
  return /localhost|127\.0\.0\.1/i.test(url);
}

/**
 * True only for a conventional local dev machine (.env.example defaults).
 * Deploys that omit NODE_ENV=production but use remote HTTPS, secure cookies, etc.
 * still run JWT/DB/cookie validation.
 */
export function isLocalDevSandbox(config: ConfigService): boolean {
  if (config.get<string>('RUNTIME_CONFIG_STRICT') === 'true') {
    return false;
  }

  const env = nodeEnv(config);
  if (!LOCAL_DEV_NODE_ENVS.has(env)) {
    return false;
  }

  if (config.get<string>('AUTH_COOKIE_SECURE') === 'true') {
    return false;
  }

  const appBase = config.get<string>('APP_BASE_URL', '').trim();
  if (appBase !== '' && !isLocalhostishUrl(appBase)) {
    return false;
  }

  const dbHost = config.get<string>('DB_HOST', 'localhost').trim().toLowerCase();
  if (!LOCAL_DB_HOSTS.has(dbHost)) {
    return false;
  }

  if (!frontendOriginsLookLocal(config)) {
    return false;
  }

  if (!rabbitMqLooksLocal(config)) {
    return false;
  }

  return true;
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

  if (isLocalDevSandbox(config)) {
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

  if (config.get<string>('AI_SERVICE_ENABLED', 'false').toLowerCase() === 'true') {
    const grpcHost = config.get<string>('AI_SERVICE_GRPC_HOST', '').trim();
    if (!grpcHost) {
      throw new RuntimeConfigError(
        'AI_SERVICE_GRPC_HOST must be set when AI_SERVICE_ENABLED=true in production.',
      );
    }
    const aiToken = config.get<string>('AI_SERVICE_TOKEN', '').trim();
    if (!aiToken) {
      throw new RuntimeConfigError(
        'AI_SERVICE_TOKEN must be set when AI_SERVICE_ENABLED=true in production.',
      );
    }
  }

  for (const key of [
    'THROTTLE_TTL_MS',
    'THROTTLE_DEFAULT_LIMIT',
    'THROTTLE_PUBLIC_LIMIT',
    'THROTTLE_UPLOAD_LIMIT',
    'THROTTLE_DOCX_LIMIT',
    'THROTTLE_SSE_LIMIT',
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
