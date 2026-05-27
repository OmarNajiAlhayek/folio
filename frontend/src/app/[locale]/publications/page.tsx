"use client";

import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { PublicationsCatalogBody } from "@/components/publications-catalog-body";
import { PAGE_SHELL } from "@/lib/page-shell";

function CatalogFallback() {
  const t = useTranslations("Publications");
  return (
    <p className="mt-8 text-sm text-ink/60" aria-live="polite">
      {t("loading")}
    </p>
  );
}

export default function PublicationsPage() {
  const t = useTranslations("Publications");

  return (
    <main className={PAGE_SHELL}>
      <header className="border-s-4 border-s-accent/35 ps-5">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-accent">
          {t("eyebrow")}
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          {t("title")}
        </h1>
        <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-ink/65">
          {t("hint")}
        </p>
      </header>

      <Suspense fallback={<CatalogFallback />}>
        <PublicationsCatalogBody />
      </Suspense>
    </main>
  );
}
