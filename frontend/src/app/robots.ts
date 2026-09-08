import type { MetadataRoute } from 'next';
import { absoluteUrl, getSiteUrl } from '@/lib/site-url';

/**
 * Crawl policy for the public site.
 *
 * Fails closed: with no `NEXT_PUBLIC_SITE_URL` configured this deployment is
 * not the public journal — it is a developer machine, a preview or a staging
 * box — and it disallows everything rather than inviting Google to index
 * whatever happens to be running. Setting the domain is
 * docs/EXTERNAL-ACTIONS.md A3, and it is what switches indexing on.
 */
export default function robots(): MetadataRoute.Robots {
  const site = getSiteUrl();

  if (site == null) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }

  return {
    rules: {
      userAgent: '*',
      // `/api/v1/public/` must stay crawlable even though `/api/` is blocked:
      // it serves the article PDFs that `citation_pdf_url` points at, and a
      // PDF Scholar cannot fetch is a paper it will not full-text index.
      // Robots precedence is longest-match, so the deeper Allow wins.
      allow: ['/', '/api/v1/public/'],
      // Everything a signed-out reader has no business being crawled into.
      // These are already auth-gated; excluding them keeps crawl budget on the
      // archive and keeps login redirects out of the index.
      disallow: [
        '/api/',
        '/*/login',
        '/*/register',
        '/*/forgot-password',
        '/*/reset-password',
        '/*/verify-email',
        '/*/complete-profile',
        '/*/dashboard',
        '/*/submissions',
        '/*/assignments',
        '/*/copyedit-assignments',
        '/*/editor',
        '/*/section-editor',
        '/*/journal-manager',
        '/*/notifications',
      ],
    },
    sitemap: absoluteUrl('/sitemap.xml') ?? undefined,
    host: site,
  };
}
