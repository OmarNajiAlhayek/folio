import { routing } from '@/i18n/routing';

/**
 * The public origin of the journal, used to build the absolute URLs that
 * crawlers and citation metadata require.
 *
 * Returns null until `PUBLIC_SITE_URL` is configured, and every caller treats
 * that as "this deployment is not the public site". That is deliberate and
 * fails closed: `robots.ts` disallows everything and `sitemap.ts` is empty
 * rather than advertising `localhost` URLs, which is what a preview or staging
 * deployment would otherwise publish to Google.
 *
 * Deliberately *not* `NEXT_PUBLIC_`-prefixed. Those are inlined textually at
 * build time, which with `output: 'standalone'` would bake the domain into the
 * Docker image; every consumer here is server-side, so a plain runtime
 * variable is both correct and re-configurable without a rebuild. It shares
 * its name with the backend setting, so one value configures both services.
 * Supplying it is docs/EXTERNAL-ACTIONS.md A3.
 */
export function getSiteUrl(): string | null {
  const raw = process.env.PUBLIC_SITE_URL;
  if (raw == null) return null;
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (trimmed === '') return null;
  try {
    new URL(trimmed);
  } catch {
    return null;
  }
  return trimmed;
}

/** Absolute URL for a locale-less app path, or null when unconfigured. */
export function absoluteUrl(path: string): string | null {
  const base = getSiteUrl();
  if (base == null) return null;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** `/en/publications/some-slug` — the locale-prefixed app path. */
export function localePath(locale: string, path: string): string {
  const suffix = path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
  return `/${locale}${suffix}`;
}

export function absoluteLocaleUrl(locale: string, path: string): string | null {
  return absoluteUrl(localePath(locale, path));
}

/**
 * `alternates.languages` for a page that exists in every locale.
 *
 * Returned empty when the site URL is unknown, because a relative hreflang is
 * worse than none — search engines resolve them against the crawled origin,
 * which is exactly the wrong origin on a preview deployment.
 */
export function localeAlternates(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const locale of routing.locales) {
    const url = absoluteLocaleUrl(locale, path);
    if (url) out[locale] = url;
  }
  return out;
}
