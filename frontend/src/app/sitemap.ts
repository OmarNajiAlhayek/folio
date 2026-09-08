import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { serverPublicJson } from '@/lib/server-api';
import {
  absoluteLocaleUrl,
  getSiteUrl,
  localeAlternates,
} from '@/lib/site-url';

/**
 * Sitemap for the public archive.
 *
 * Empty until `PUBLIC_SITE_URL` is configured — a sitemap of `localhost`
 * URLs is worse than no sitemap, and a preview deployment must not advertise
 * itself. Turning it on is docs/EXTERNAL-ACTIONS.md A3, and submitting it to
 * Search Console is A4.
 *
 * Only published articles and released issues are listed, because that is all
 * the public endpoints return: a retracted article vanishes from here for the
 * same reason it vanishes from the portal.
 */

/**
 * Regenerated hourly. Without this the route is prerendered once at build time
 * and newly published articles never reach it until the next deploy. An hour
 * is ample for crawler purposes and keeps a full archive walk off the request
 * path. A retraction still disappears from the article route immediately —
 * only its sitemap entry lags, and it points at a 404, which is harmless.
 */
export const revalidate = 3600;

/** Sitemaps cap at 50,000 URLs; we page well below that and stop cleanly. */
const MAX_ARTICLES = 10_000;
const ARTICLE_PAGE_SIZE = 100;

type CatalogPage = {
  items: { slug: string | null; publishedAt: string | null }[];
  total: number;
  offset: number;
};

type PortalJournal = {
  slug: string;
  latestIssue: { publishedAt: string | null } | null;
};

type JournalDetail = {
  journal: PortalJournal;
  issues: { year: number; number: number; publishedAt: string | null }[];
};

function entry(
  path: string,
  lastModified: string | null,
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'],
  priority: number,
): MetadataRoute.Sitemap[number] | null {
  const url = absoluteLocaleUrl(routing.defaultLocale, path);
  if (!url) return null;
  return {
    url,
    lastModified: lastModified ? new Date(lastModified) : undefined,
    changeFrequency,
    priority,
    alternates: { languages: localeAlternates(path) },
  };
}

async function safe<T>(path: string): Promise<T | null> {
  try {
    return await serverPublicJson<T>(path);
  } catch {
    // A sitemap that is missing a section is recoverable; one that throws is a
    // 500 to every crawler that asks for it.
    return null;
  }
}

async function articleEntries(): Promise<MetadataRoute.Sitemap> {
  const out: MetadataRoute.Sitemap = [];
  let offset = 0;

  while (out.length < MAX_ARTICLES) {
    const page = await safe<CatalogPage>(
      `/public/submissions?limit=${ARTICLE_PAGE_SIZE}&offset=${offset}`,
    );
    if (!page || page.items.length === 0) break;

    for (const item of page.items) {
      if (!item.slug) continue;
      const e = entry(
        `/publications/${item.slug}`,
        item.publishedAt,
        'yearly',
        0.8,
      );
      if (e) out.push(e);
    }

    offset += page.items.length;
    if (offset >= page.total) break;
  }

  return out;
}

async function journalEntries(): Promise<MetadataRoute.Sitemap> {
  const journals = await safe<PortalJournal[]>('/public/journals');
  if (!journals) return [];

  const out: MetadataRoute.Sitemap = [];
  for (const j of journals) {
    const e = entry(
      `/journals/${j.slug}`,
      j.latestIssue?.publishedAt ?? null,
      'monthly',
      0.7,
    );
    if (e) out.push(e);

    const detail = await safe<JournalDetail>(`/public/journals/${j.slug}`);
    for (const issue of detail?.issues ?? []) {
      const ie = entry(
        `/journals/${j.slug}/issues/${issue.year}/${issue.number}`,
        issue.publishedAt,
        'monthly',
        0.6,
      );
      if (ie) out.push(ie);
    }
  }
  return out;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (getSiteUrl() == null) return [];

  const roots = [
    entry('/', null, 'weekly', 1),
    entry('/publications', null, 'daily', 0.9),
    entry('/journals', null, 'weekly', 0.9),
  ].filter((e): e is MetadataRoute.Sitemap[number] => e !== null);

  const [journals, articles] = await Promise.all([
    journalEntries(),
    articleEntries(),
  ]);

  return [...roots, ...journals, ...articles];
}
