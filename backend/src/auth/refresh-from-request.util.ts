import type { Request } from 'express';
import { FOLIO_REFRESH_COOKIE } from './auth-cookie.util';

export function refreshFromCookieOrBody(
  req: Request & { cookies?: Record<string, string> },
): string | null {
  const cookies = req.cookies as Record<string, string> | undefined;
  const fromCookie = cookies?.[FOLIO_REFRESH_COOKIE];
  if (typeof fromCookie === 'string' && fromCookie.length > 0) {
    return fromCookie;
  }
  const body = req.body as { refreshToken?: unknown } | undefined;
  if (typeof body?.refreshToken === 'string' && body.refreshToken.length > 0) {
    return body.refreshToken;
  }
  return null;
}
