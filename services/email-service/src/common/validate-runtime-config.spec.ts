import {
  RuntimeConfigError,
  validateEmailServiceRuntimeConfig,
} from './validate-runtime-config';

describe('validateEmailServiceRuntimeConfig', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it('allows development with example DB password', () => {
    process.env.NODE_ENV = 'development';
    process.env.DB_PASSWORD = 'changeme';
    expect(() => validateEmailServiceRuntimeConfig()).not.toThrow();
  });

  it('rejects production with example DB_PASSWORD', () => {
    process.env.NODE_ENV = 'production';
    process.env.DB_PASSWORD = 'changeme';
    expect(() => validateEmailServiceRuntimeConfig()).toThrow(RuntimeConfigError);
  });

  it('rejects production noop provider', () => {
    process.env.NODE_ENV = 'production';
    process.env.DB_PASSWORD = 'prod-db-secret-value';
    process.env.EMAIL_PROVIDER = 'noop';
    expect(() => validateEmailServiceRuntimeConfig()).toThrow(RuntimeConfigError);
  });

  it('rejects production smtp without SMTP_HOST', () => {
    process.env.NODE_ENV = 'production';
    process.env.DB_PASSWORD = 'prod-db-secret-value';
    process.env.EMAIL_PROVIDER = 'smtp';
    process.env.EMAIL_FROM = 'no-reply@example.com';
    delete process.env.SMTP_HOST;
    expect(() => validateEmailServiceRuntimeConfig()).toThrow(RuntimeConfigError);
  });

  it('rejects production smtp without EMAIL_FROM', () => {
    process.env.NODE_ENV = 'production';
    process.env.DB_PASSWORD = 'prod-db-secret-value';
    process.env.EMAIL_PROVIDER = 'smtp';
    process.env.SMTP_HOST = 'smtp.example.com';
    delete process.env.EMAIL_FROM;
    expect(() => validateEmailServiceRuntimeConfig()).toThrow(RuntimeConfigError);
  });
});
