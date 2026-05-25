import type { ConfigService } from '@nestjs/config';

export type AuthResponseBody = {
  user: unknown;
  accessToken?: string;
  /** Same value as `folio_csrf` cookie — SPA uses this for `X-CSRF-Token`. */
  csrfToken: string;
};

export function buildAuthResponseBody(
  config: ConfigService,
  user: unknown,
  accessToken: string,
  csrfToken: string,
): AuthResponseBody {
  if (config.get<string>('AUTH_RETURN_BEARER') === 'true') {
    return { user, accessToken, csrfToken };
  }
  return { user, csrfToken };
}
