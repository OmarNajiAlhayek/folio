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

const MIN_REVIEW_DUE_DAYS = 4;

export function validateEmailServiceRuntimeConfig(): void {
  const token = (process.env.EMAIL_SERVICE_TOKEN ?? '').trim();

  if (!token) {
    throw new RuntimeConfigError(
      'EMAIL_SERVICE_TOKEN must be set. Nest must authenticate internal admin API calls (use dev-email-internal-token in docker-compose).',
    );
  }

  const reviewDueRaw = (process.env.REVIEW_DUE_IN_DAYS ?? '').trim();
  if (reviewDueRaw) {
    const reviewDueInDays = parseInt(reviewDueRaw, 10);
    if (
      !Number.isFinite(reviewDueInDays) ||
      reviewDueInDays < MIN_REVIEW_DUE_DAYS
    ) {
      throw new RuntimeConfigError(
        `REVIEW_DUE_IN_DAYS must be an integer >= ${MIN_REVIEW_DUE_DAYS} when set.`,
      );
    }
  }

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
  if (provider === 'noop') {
    throw new RuntimeConfigError(
      'EMAIL_PROVIDER=noop is not allowed in production. Set EMAIL_PROVIDER=smtp (or another real provider) and configure SMTP_*.',
    );
  }
  if (provider === 'smtp') {
    if (!(process.env.SMTP_HOST ?? '').trim()) {
      throw new RuntimeConfigError(
        'SMTP_HOST is required when EMAIL_PROVIDER=smtp in production.',
      );
    }
    if (!(process.env.EMAIL_FROM ?? '').trim()) {
      throw new RuntimeConfigError(
        'EMAIL_FROM is required when EMAIL_PROVIDER=smtp in production.',
      );
    }
  }

  const rabbitUrl = process.env.RABBITMQ_URL ?? '';
  if (rabbitUrl.includes('guest:guest@')) {
    throw new RuntimeConfigError(
      'RABBITMQ_URL must not use guest:guest in production.',
    );
  }
}
