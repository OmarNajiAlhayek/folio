import type { ConfigService } from '@nestjs/config';

export type AuthResponseBody = {
  user?: unknown;
  accessToken?: string;
  refreshToken?: string;
  /** Same value as `folio_csrf` cookie — SPA uses this for `X-CSRF-Token`. */
  csrfToken: string;
};

export function buildAuthResponseBody(
  config: ConfigService,
  user: unknown,
  accessToken: string,
  refreshToken: string,
  csrfToken: string,
): AuthResponseBody {
  const base: AuthResponseBody = { csrfToken };
  if (user !== undefined) {
    base.user = user;
  }
  if (config.get<string>('AUTH_RETURN_BEARER') === 'true') {
    base.accessToken = accessToken;
    base.refreshToken = refreshToken;
  }
  return base;
}
