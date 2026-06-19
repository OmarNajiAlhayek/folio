const TRANSIENT_ERRNO = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
]);

const TRANSIENT_DB_CODES = new Set([
  '57P01',
  '53300',
  '08006',
  '08001',
  '08003',
]);

const TRANSIENT_MESSAGE_PATTERNS = [
  'connection terminated',
  'connection terminated unexpectedly',
  'timeout',
  'timed out',
  'too many clients',
  'server closed the connection',
  'broken pipe',
  'socket hang up',
  'econnreset',
  'etimedout',
];

const TRANSIENT_SMTP_PATTERNS = [
  ...TRANSIENT_MESSAGE_PATTERNS,
  '421 ',
  '450 ',
  '451 ',
  '452 ',
  'connection lost',
  'smtp connection',
];

const PERMANENT_SMTP_PATTERNS = [
  '550 ',
  '551 ',
  '552 ',
  '553 ',
  '554 ',
  'mailbox unavailable',
  'user unknown',
  'invalid recipient',
];

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function errorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

function messageMatches(text: string, patterns: string[]): boolean {
  const lower = text.toLowerCase();
  return patterns.some((p) => lower.includes(p.toLowerCase()));
}

export function isTransientDbError(err: unknown): boolean {
  const code = errorCode(err);
  if (code && TRANSIENT_DB_CODES.has(code)) return true;
  if (code && TRANSIENT_ERRNO.has(code)) return true;
  return messageMatches(errorMessage(err), TRANSIENT_MESSAGE_PATTERNS);
}

export function isTransientDeliveryError(err: unknown): boolean {
  const message = errorMessage(err);
  if (messageMatches(message, PERMANENT_SMTP_PATTERNS)) return false;
  if (message.includes('SMTP not configured')) return false;
  const code = errorCode(err);
  if (code && TRANSIENT_ERRNO.has(code)) return true;
  return messageMatches(message, TRANSIENT_SMTP_PATTERNS);
}

export function providerSendOutcome(err: unknown): HandlerOutcomeKind {
  return isTransientDeliveryError(err) ? 'nack-requeue' : 'nack-no-requeue';
}

export type HandlerOutcomeKind = 'nack-requeue' | 'nack-no-requeue';
