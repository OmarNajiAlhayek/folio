"use client";

import NextLink from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RouteErrorFallback } from "@/components/route-error-fallback";
import { getRouteErrorCopy, localeFromPathname } from "@/lib/route-error-copy";
import "./globals.css";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Last-resort boundary when the root layout fails. Replaces the entire document,
 * so this file must define `html` and `body`.
 */
export default function GlobalError({ error, reset }: Props) {
  const [pathname, setPathname] = useState("/");
  const locale = useMemo(() => localeFromPathname(pathname), [pathname]);
  const copy = useMemo(() => getRouteErrorCopy(locale), [locale]);
  const prefix = `/${locale}`;
  const dir = locale === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    setPathname(window.location.pathname);
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
