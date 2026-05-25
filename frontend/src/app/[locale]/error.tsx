"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { RouteErrorFallback } from "@/components/route-error-fallback";
import { Link } from "@/i18n/navigation";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function LocaleSegmentError({ error, reset }: Props) {
  const t = useTranslations("RouteError");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <RouteErrorFallback
      copy={{
        title: t("title"),
        description: t("description"),
        retry: t("retry"),
        backHome: t("backHome"),
        browsePublications: t("browsePublications"),
      }}
      onReset={reset}
      homeHref="/dashboard"
      publicationsHref="/publications"
      LinkComponent={Link}
    />
  );
}
