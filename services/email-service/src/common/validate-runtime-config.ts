const INSECURE_DB_PASSWORDS = new Set([
  '',
  'changeme',
  'password',
  'postgres',
  '0000',
]);

export class RuntimeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeConfigError';
  }
}

function isProduction(): boolean {
  return (process.env.NODE_ENV ?? 'development') === 'production';
}

export function validateEmailServiceRuntimeConfig(): void {
  if (!isProduction()) {
    return;
  }

  const dbPassword = (process.env.DB_PASSWORD ?? '').trim();
  if (INSECURE_DB_PASSWORDS.has(dbPassword)) {
    throw new RuntimeConfigError(
      'DB_PASSWORD must be a strong secret in production (not changeme or other example defaults).',
    );
  }

  const provider = (process.env.EMAIL_PROVIDER ?? 'noop').trim().toLowerCase();
  if (provider === 'smtp' && !(process.env.SMTP_HOST ?? '').trim()) {
    throw new RuntimeConfigError(
      'SMTP_HOST is required when EMAIL_PROVIDER=smtp in production.',
    );
  }

  const rabbitUrl = process.env.RABBITMQ_URL ?? '';
  if (rabbitUrl.includes('guest:guest@')) {
    throw new RuntimeConfigError(
      'RABBITMQ_URL must not use guest:guest in production.',
    );
  }
}
