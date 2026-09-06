'use client';

import NextLink from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { RouteErrorFallback } from '@/components/route-error-fallback';
import { getRouteErrorCopy, localeFromPathname } from '@/lib/route-error-copy';
import './globals.css';

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Last-resort boundary when the root layout fails. Replaces the entire document,
 * so this file must define `html` and `body`.
 */
export default function GlobalError({ error, reset }: Props) {
  // Read the path during the lazy initializer rather than in an effect: setting
  // state synchronously in an effect renders the error page twice, once in the
  // wrong locale. `window` is absent while prerendering, hence the guard.
  const [pathname] = useState(() =>
    typeof window === 'undefined' ? '/' : window.location.pathname,
  );
  const locale = useMemo(() => localeFromPathname(pathname), [pathname]);
  const copy = useMemo(() => getRouteErrorCopy(locale), [locale]);
  const prefix = `/${locale}`;
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body className="min-h-full flex flex-col antialiased">
        <RouteErrorFallback
          copy={copy}
          onReset={reset}
          homeHref={`${prefix}/dashboard`}
          publicationsHref={`${prefix}/publications`}
          LinkComponent={NextLink}
        />
      </body>
    </html>
  );
}
