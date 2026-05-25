import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  FOLIO_ACCESS_COOKIE,
  readCsrfFromRequest,
} from '../../auth/auth-cookie.util';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Routes that skip CSRF (pre-auth or public). Prefix match on path after global prefix. */
const CSRF_SKIP_PATH_PREFIXES = [
  '/auth/login',
  '/auth/register',
  '/health',
  '/public/',
];

/**
 * Cookie-authenticated SPA routes where a CSRF header/cookie mismatch should not
 * block downloads (constructor docx). Session cookie still required.
 */
const CSRF_RELAXED_EXACT_PATHS = new Set([
  '/submissions/generate-docx-standalone',
]);

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const method = req.method.toUpperCase();
    if (SAFE_METHODS.has(method)) {
      return true;
    }

    const path = req.path.replace(/^\/api\/v1/, '') || req.path;
    if (CSRF_SKIP_PATH_PREFIXES.some((p) => path.startsWith(p))) {
      return true;
    }

    if (
      CSRF_RELAXED_EXACT_PATHS.has(path) &&
      req.cookies?.[FOLIO_ACCESS_COOKIE]
    ) {
      return true;
    }

    const authHeader = req.headers.authorization;
    if (
      typeof authHeader === 'string' &&
      authHeader.startsWith('Bearer ') &&
      authHeader.length > 7
    ) {
      return true;
    }

    const { cookie, header } = readCsrfFromRequest(req);
    if (!cookie || !header || cookie !== header) {
      throw new ForbiddenException({
        message: 'Invalid or missing CSRF token',
        code: 'CSRF_TOKEN_INVALID',
      });
    }

    if (!req.cookies?.[FOLIO_ACCESS_COOKIE] && !authHeader) {
      throw new ForbiddenException({
        message: 'Authentication required',
        code: 'FORBIDDEN',
      });
    }

    return true;
  }
}
