import { randomUUID } from 'crypto';

/** RFC 4122 UUID v4 (case-insensitive). Reject anything else. */
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function generateRequestId(): string {
  return randomUUID();
}

/**
 * Accept only a well-formed UUID v4 from the client; otherwise generate a new ID.
 * Prevents log injection / header reflection from arbitrary client strings.
 */
export function normalizeRequestId(raw: string | undefined | null): string {
  const trimmed = raw?.trim();
  if (trimmed && UUID_V4_RE.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return generateRequestId();
}

export function isValidRequestId(value: string): boolean {
  return UUID_V4_RE.test(value.trim());
}
