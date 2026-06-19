import createIntlMiddleware from 'next-intl/middleware';
import { NextRequest } from 'next/server';
import {
  buildContentSecurityPolicy,
  createCspNonce,
  CSP_NONCE_HEADER,
} from './lib/csp';
import { routing } from './i18n/routing';

const handleI18nRouting = createIntlMiddleware(routing);

const isDev = process.env.NODE_ENV !== 'production';

export default function middleware(request: NextRequest) {
  const nonce = createCspNonce();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(CSP_NONCE_HEADER, nonce);

  const intlRequest = new NextRequest(request.url, {
    headers: requestHeaders,
    method: request.method,
  });

  const response = handleI18nRouting(intlRequest);

  response.headers.set(
    'Content-Security-Policy',
    buildContentSecurityPolicy(nonce, isDev),
  );
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}

export const config = {
  matcher: ['/((?!api|trpc|_next|_vercel|.*\\..*).*)'],
};
