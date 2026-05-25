import type { Request } from 'express';
import { FOLIO_ACCESS_COOKIE } from './auth-cookie.util';

export function jwtFromCookieOrBearer(req: Request): string | null {
  const fromCookie = req.cookies?.[FOLIO_ACCESS_COOKIE];
  if (typeof fromCookie === 'string' && fromCookie.length > 0) {
    return fromCookie;
  }
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  return null;
}
