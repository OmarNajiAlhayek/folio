"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo } from "react";
import { RouteErrorFallback } from "@/components/route-error-fallback";
import { getRouteErrorCopy, localeFromPathname } from "@/lib/route-error-copy";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

/** Catches failures in `app/[locale]/layout.tsx` and other segments above locale pages. */
export default function AppSegmentError({ error, reset }: Props) {
  const pathname = usePathname();
  const locale = useMemo(() => localeFromPathname(pathname), [pathname]);
  const copy = useMemo(() => getRouteErrorCopy(locale), [locale]);
  const prefix = `/${locale}`;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <RouteErrorFallback
      copy={copy}
      onReset={reset}
      homeHref={`${prefix}/dashboard`}
      publicationsHref={`${prefix}/publications`}
      LinkComponent={NextLink}
    />
  );
}
