/**
 * Header redaction for request/response logs.
 *
 * pino-http's default serializers log the whole header object, which puts live
 * credentials into every log line: the session JWT and refresh token ride in
 * `cookie`, bearer tokens in `authorization`, and the backend↔email-service and
 * backend↔ai-service shared secret in `x-folio-service-token`. Anyone who can
 * read a log — a shipper, an aggregator, a backup, a file pasted into a ticket
 * — could replay any of them.
 *
 * This is a deny-list rather than an allow-list on purpose: the remaining
 * headers (user-agent, content-type, referer) are what makes a request log
 * worth keeping, and a new secret header is a rarer event than a new benign
 * one. Add to {@link SENSITIVE_HEADERS} whenever a header starts carrying a
 * credential.
 */

export const REDACTED = '[REDACTED]';

/** Lower-case header names whose values are credentials, never diagnostics. */
export const SENSITIVE_HEADERS: ReadonlySet<string> = new Set([
  'cookie',
  'set-cookie',
  'authorization',
  'proxy-authorization',
  'x-csrf-token',
  // Shared secrets between Folio services.
  'x-folio-service-token',
  'x-folio-ops-token',
]);

export type HeaderBag = Record<string, unknown> | undefined;

/**
 * Returns a copy with every sensitive value replaced. The header name itself is
 * kept, so a log still shows that a request *was* authenticated — only the
 * credential is removed.
 */
export function redactSensitiveHeaders(headers: HeaderBag): HeaderBag {
  if (headers == null || typeof headers !== 'object') {
    return headers;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? REDACTED : value;
  }
  return out;
}
