import { randomBytes } from 'crypto';
import type { Response } from 'express';
import type { ConfigService } from '@nestjs/config';

export const FOLIO_ACCESS_COOKIE = 'folio_access';
export const FOLIO_CSRF_COOKIE = 'folio_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/** JWT cookie: scoped to API routes only. */
const ACCESS_COOKIE_PATH = '/api/v1';
/** CSRF cookie: root path so SPA pages can read it for X-CSRF-Token. */
const CSRF_COOKIE_PATH = '/';

export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

function cookieSecure(config: ConfigService): boolean {
  return config.get<string>('AUTH_COOKIE_SECURE') === 'true';
}

export function setAuthCookies(
  res: Response,
  config: ConfigService,
  accessToken: string,
  csrfToken: string,
): void {
  const secure = cookieSecure(config);
  const common = {
    sameSite: 'lax' as const,
    secure,
  };
  res.cookie(FOLIO_ACCESS_COOKIE, accessToken, {
    ...common,
    path: ACCESS_COOKIE_PATH,
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  setCsrfCookie(res, config, csrfToken);
}

/** Issue or refresh the CSRF cookie for an already-authenticated session. */
export function setCsrfCookie(
  res: Response,
  config: ConfigService,
  csrfToken: string,
): void {
  res.cookie(FOLIO_CSRF_COOKIE, csrfToken, {
    sameSite: 'lax' as const,
    secure: cookieSecure(config),
    path: CSRF_COOKIE_PATH,
    httpOnly: false,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response, config: ConfigService): void {
  const secure = cookieSecure(config);
  const common = {
    sameSite: 'lax' as const,
    secure,
  };
  res.clearCookie(FOLIO_ACCESS_COOKIE, {
    ...common,
    path: ACCESS_COOKIE_PATH,
    httpOnly: true,
  });
  res.clearCookie(FOLIO_CSRF_COOKIE, {
    ...common,
    path: CSRF_COOKIE_PATH,
    httpOnly: false,
  });
}

export function readCsrfFromRequest(req: {
  cookies?: Record<string, string>;
  headers: Record<string, string | string[] | undefined>;
}): { cookie: string | undefined; header: string | undefined } {
  const cookie = req.cookies?.[FOLIO_CSRF_COOKIE];
  const raw = req.headers[CSRF_HEADER] ?? req.headers['X-CSRF-Token'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  return { cookie, header };
}
