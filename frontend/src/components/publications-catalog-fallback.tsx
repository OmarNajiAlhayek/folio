"use client";

import { useTranslations } from "next-intl";

export function PublicationsCatalogFallback() {
  const t = useTranslations("Publications");
  return (
    <p className="mt-8 text-sm text-ink/60" aria-live="polite">
      {t("loading")}
    </p>
  );
}
