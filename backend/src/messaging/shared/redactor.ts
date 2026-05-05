/**
 * Mirror of `packages/shared/messaging/redactor.ts`. Strips PII fields
 * (reviewer, invitedBy, email-shaped strings) before payloads approach
 * any logger or DLQ inspection tooling. Keep in sync with email-service.
 */

export type RedactedPayload = {
  type?: unknown;
  idempotencyKey?: unknown;
  assignmentSlug?: unknown;
  occurredAt?: unknown;
  reviewer?: '[redacted]';
  invitedBy?: '[redacted]';
  [key: string]: unknown;
};

const PII_FIELDS = new Set(['reviewer', 'invitedBy']);
const KEEP_FIELDS = new Set([
  'type',
  'idempotencyKey',
  'assignmentSlug',
  'occurredAt',
  'reminderId',
  'kind',
  'submissionSlug',
]);

export function redactEventPayload(payload: unknown): RedactedPayload {
  if (!payload || typeof payload !== 'object') {
    return { value: '[non-object payload]' };
  }
  const out: RedactedPayload = {};
  const src = payload as Record<string, unknown>;
  for (const [key, value] of Object.entries(src)) {
    if (PII_FIELDS.has(key)) {
      out[key] = '[redacted]' as never;
      continue;
    }
    if (KEEP_FIELDS.has(key)) {
      out[key] = value;
      continue;
    }
    if (typeof value === 'string' && /@/.test(value)) {
      out[key] = '[redacted-email-like]';
      continue;
    }
    if (typeof value === 'object' && value !== null) {
      out[key] = '[redacted-object]';
      continue;
    }
    out[key] = value;
  }
  return out;
}
