import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import bundleAnalyzer from '@next/bundle-analyzer';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});
const projectRoot = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(projectRoot, '..');

const sharedSubpathAliases = {
  '@folio/shared/compose': './packages/shared/constructor/index.ts',
  '@folio/shared/compose/canonical-json':
    './packages/shared/constructor/canonical-json.ts',
  '@folio/shared/contracts/pre-submit-analysis':
    './packages/shared/contracts/pre-submit-analysis.ts',
  '@folio/shared/text/search-normalize':
    './packages/shared/text/search-normalize.ts',
} as const;

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: ['@folio/shared'],
  // Self-contained server bundle for the Docker image (frontend/Dockerfile).
  // Additive: `next start` and `next dev` are unaffected.
  output: 'standalone',
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    // Monorepo root so Turbopack can resolve file:-linked @folio/shared sources.
    root: monorepoRoot,
    resolveAlias: sharedSubpathAliases,
  },
  async rewrites() {
    const target = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:5243';
    return [
      {
        source: '/api/v1/:path*',
        destination: `${target}/api/v1/:path*`,
      },
    ];
  },
  async redirects() {
    return [
      // Legacy "new" path → current create flow.
      {
        source: '/:locale/submissions/constructor/new',
        destination: '/:locale/submissions/compose/create',
        permanent: true,
      },
      // Legacy "constructor/create" → renamed segment.
      {
        source: '/:locale/submissions/constructor/create',
        destination: '/:locale/submissions/compose/create',
        permanent: true,
      },
      // Legacy per-slug path.
      {
        source: '/:locale/submissions/:slug/constructor',
        destination: '/:locale/submissions/:slug/compose',
        permanent: true,
      },
      // Email admin moved from editor to journal-manager scope.
      {
        source: '/:locale/editor/email-settings',
        destination: '/:locale/journal-manager/email-settings',
        permanent: true,
      },
      // Search curation moved from editor to journal-manager scope.
      {
        source: '/:locale/editor/search',
        destination: '/:locale/journal-manager/search-curation',
        permanent: true,
      },
      {
        source: '/:locale/editor/search/:path*',
        destination: '/:locale/journal-manager/search-curation',
        permanent: true,
      },
    ];
  },
};

export default withBundleAnalyzer(withNextIntl(nextConfig));
