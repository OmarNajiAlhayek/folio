"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export type RelatedPublication = {
  id: string;
  slug: string;
  title: string;
  titleAr?: string | null;
  abstract: string;
  abstractAr?: string | null;
  similarity: number;
};

type Props = {
  items: RelatedPublication[];
  loading?: boolean;
};

function pickTitle(item: RelatedPublication, locale: string) {
  if (locale === "ar" && item.titleAr?.trim()) {
    return item.titleAr;
  }
  return item.title;
}

function pickExcerpt(item: RelatedPublication, locale: string) {
  const text =
    locale === "ar" && item.abstractAr?.trim()
      ? item.abstractAr
      : item.abstract;
  const trimmed = text.trim();
  if (trimmed.length <= 220) {
    return trimmed;
  }
  return `${trimmed.slice(0, 217)}…`;
}

export function RelatedPublications({ items, loading }: Props) {
  const t = useTranslations("PublicationDetail");
  const locale = useLocale();

  if (loading) {
    return (
      <section className="mt-12 border-t border-ink/10 pt-10">
        <h2 className="font-medium text-ink">{t("relatedTitle")}</h2>
        <p className="mt-3 text-sm text-ink/60">{t("relatedLoading")}</p>
      </section>
    );
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="mt-12 border-t border-ink/10 pt-10">
      <h2 className="font-medium text-ink">{t("relatedTitle")}</h2>
      <ul className="mt-4 space-y-4">
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-lg border border-ink/10 bg-paper/40 px-4 py-4"
          >
            <h3 className="font-serif text-lg font-semibold text-ink" dir="auto">
              <Link
                href={`/publications/${encodeURIComponent(item.slug)}`}
                className="hover:text-accent"
              >
                {pickTitle(item, locale)}
              </Link>
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink/75" dir="auto">
              {pickExcerpt(item, locale)}
            </p>
            <p className="mt-3 text-xs text-ink/50">
              <Link
                href={`/publications/${encodeURIComponent(item.slug)}`}
                className="text-accent hover:underline"
              >
                {t("readRelated")}
              </Link>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
