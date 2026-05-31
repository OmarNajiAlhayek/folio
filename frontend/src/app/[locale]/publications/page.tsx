import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PublicationsCatalogBody } from "@/components/publications-catalog-body";
import { PublicationsCatalogFallback } from "@/components/publications-catalog-fallback";
import { PAGE_SHELL } from "@/lib/page-shell";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function PublicationsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Publications" });

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

      <Suspense fallback={<PublicationsCatalogFallback />}>
        <PublicationsCatalogBody />
      </Suspense>
    </main>
  );
}
