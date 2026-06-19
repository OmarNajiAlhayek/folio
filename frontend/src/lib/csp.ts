/** Request header carrying the per-request CSP nonce (set in middleware). */
export const CSP_NONCE_HEADER = 'x-nonce';

const SENTRY_CONNECT_SRC = [
  'https://*.ingest.sentry.io',
  'https://*.ingest.us.sentry.io',
];

export function createCspNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString('base64');
}

export function buildContentSecurityPolicy(
  nonce: string,
  isDev: boolean,
): string {
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;

  const connectSrc = [
    "'self'",
    ...(process.env.NEXT_PUBLIC_SENTRY_DSN ? SENTRY_CONNECT_SRC : []),
  ].join(' ');

  return [
    "default-src 'self'",
    scriptSrc,
    `connect-src ${connectSrc}`,
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}
