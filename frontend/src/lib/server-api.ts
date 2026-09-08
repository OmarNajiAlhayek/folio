import { cache } from 'react';

/**
 * Server-side reads of the public API, for server components.
 *
 * The browser client (`lib/api.ts`) deliberately resolves to a *relative*
 * `/api/v1` so httpOnly cookie auth stays same-origin through the Next rewrite
 * — see frontend/AGENTS.md. A server component has no origin to be relative
 * to, so it must call the backend directly, and `API_PROXY_TARGET` is already
 * the internal address the rewrite uses. Reusing it means server rendering and
 * browser proxying can never point at two different backends.
 *
 * Nothing here sends credentials. These helpers are only for `public/*`
 * endpoints, which are unauthenticated by design; anything requiring a session
 * belongs in a client component where the cookie actually travels.
 *
 * This module must not be imported from a client component. There is no
 * `server-only` package in this project, so that is a convention rather than a
 * build error — importing it client-side would leak the internal API address
 * into the browser bundle.
 */

function serverApiBase(): string {
  const raw = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:5243';
  return raw.replace(/\/+$/, '');
}

export function serverApiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${serverApiBase()}/api/v1${normalized}`;
}

export class ServerApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ServerApiError';
  }
}

/**
 * Fetches a public endpoint, returning `null` for 404 so a page can call
 * `notFound()` and every other failure as a throw.
 *
 * `cache: 'no-store'` is deliberate. A retracted article must disappear from
 * the public site immediately, and any revalidation window is exactly the
 * period in which a retracted paper keeps being served. The performance work
 * this unblocks comes from rendering on the server at all — no hydration
 * waterfall, metadata in the first byte — not from holding stale copies.
 */
async function fetchPublicJson<T>(path: string): Promise<T | null> {
  const res = await fetch(serverApiUrl(path), {
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new ServerApiError(
      res.status,
      `Public API ${path} responded ${res.status}`,
    );
  }
  return (await res.json()) as T;
}

/**
 * Memoised for the duration of one render pass, so `generateMetadata` and the
 * page component that follows it share a single request rather than each
 * fetching the article.
 */
export const serverPublicJson = cache(fetchPublicJson);
