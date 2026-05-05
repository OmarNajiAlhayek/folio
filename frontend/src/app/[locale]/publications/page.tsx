"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { PAGE_SHELL } from "@/lib/page-shell";
import { publicJson } from "@/lib/public-api";

type Item = {
  id: string;
  slug: string | null;
  title: string;
  titleAr?: string | null;
  abstract: string;
  abstractAr?: string | null;
  publishedAt: string | null;
  author?: { displayName: string; email: string };
};

function formatDate(iso: string | null, locale: string) {
  if (!iso) return "";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
    dateStyle: "medium",
  }).format(new Date(iso));
}

function CatalogSkeleton() {
  return (
    <div className="mt-6 space-y-5" aria-hidden>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="animate-pulse rounded-2xl border border-ink/10 bg-surface/85 p-6 shadow-sm"
        >
          <div className="h-8 max-w-xl rounded bg-ink/10" />
          <div className="mt-4 h-3 w-48 rounded bg-ink/10" />
          <div className="mt-6 space-y-2 border-s-4 border-ink/10 ps-4">
            <div className="h-3 rounded bg-ink/10" />
            <div className="h-3 rounded bg-ink/10" />
            <div className="h-3 max-w-lg rounded bg-ink/10" />
          </div>
          <div className="mt-6 h-4 w-24 rounded bg-accent/20" />
        </div>
      ))}
    </div>
  );
}

export default function PublicationsPage() {
  const t = useTranslations("Publications");
  const tWf = useTranslations("SubmissionWorkflow");
  const locale = useLocale();
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    publicJson<Item[]>("/public/submissions")
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : t("loadFailed"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

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

        {error && (
          <div
            className="mt-8 rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-red-800 shadow-sm"
            role="alert"
          >
            {error}
          </div>
        )}

        {loading ? (
          <>
            <p className="sr-only" aria-live="polite">
              {t("loading")}
            </p>
            <CatalogSkeleton />
          </>
        ) : !error && items.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-ink/15 bg-surface/60 px-6 py-10 text-center shadow-sm">
            <p className="font-serif text-base text-ink/90">{t("empty")}</p>
          </div>
        ) : (
          !error && (
            <div className="mt-6 space-y-5">
              {items.map((p) => {
                const dateStr = formatDate(p.publishedAt, locale);
                const meta = [p.author?.displayName, dateStr]
                  .filter(Boolean)
                  .join(" · ");
                const pubSlug = p.slug ?? p.id;
                return (
                  <article
                    key={p.id}
                    className="group rounded-2xl border border-ink/10 bg-surface/90 p-5 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur-[2px] transition duration-300 hover:border-ink/15 hover:shadow-[0_20px_50px_-24px_rgba(15,23,42,0.18)] sm:p-6"
                  >
                    <Link
                      href={`/publications/${encodeURIComponent(pubSlug)}`}
                      className="block outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 focus-visible:ring-offset-paper rounded-xl -m-1 p-1"
                    >
                      <div>
                        <h2 className="font-serif text-2xl font-semibold leading-snug text-ink transition-colors duration-200 group-hover:text-accent sm:text-[1.65rem]">
                          {p.title}
                        </h2>
                        {p.titleAr?.trim() ? (
                          <p
                            dir="rtl"
                            className="mt-2 font-serif text-xl font-semibold leading-snug text-ink/90"
                          >
                            {p.titleAr}
                          </p>
                        ) : null}
                      </div>
                      {meta ? (
                        <p className="mt-3 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink/45">
                          {meta}
                        </p>
                      ) : null}
                      {p.abstract ? (
                        <div className="mt-6 space-y-3 border-s-4 border-accent/40 ps-5">
                          <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-ink/45">
                            {tWf("abstractLabelEn")}
                          </p>
                          <p
                            dir="ltr"
                            className="text-sm leading-relaxed text-ink/78 line-clamp-4"
                          >
                            {p.abstract}
                          </p>
                          {p.abstractAr?.trim() ? (
                            <>
                              <p className="pt-1 text-[0.65rem] font-semibold uppercase tracking-wide text-ink/45">
                                {tWf("abstractLabelAr")}
                              </p>
                              <p
                                dir="rtl"
                                className="text-sm leading-relaxed text-ink/78 line-clamp-3"
                              >
                                {p.abstractAr}
                              </p>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                      <span className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-accent transition group-hover:gap-3">
                        {t("readArticle")}
                        <svg
                          className="size-4 rtl:rotate-180"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-hidden
                        >
                          <path
                            fillRule="evenodd"
                            d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </span>
                    </Link>
                  </article>
                );
              })}
            </div>
          )
        )}
    </main>
  );
}
