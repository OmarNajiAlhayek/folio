"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import { ApiErrorState } from "@/components/api-error-state";
import { getApiErrorKind } from "@/lib/api-error-message";
import { getApiBase } from "@/lib/api";
import { formatMediumDate } from "@/lib/format-date";
import { PAGE_SHELL_NARROW } from "@/lib/page-shell";
import { LoadingCenter } from "@/components/ui/spinner";
import { RelatedPublications } from "@/components/related-publications";
import {
  usePublicationDetail,
  useRelatedPublications,
} from "@/lib/queries/publications";
import { useApiErrorMessages } from "@/lib/use-api-error-messages";
import { useDisciplineLabel } from "@/lib/use-discipline-label";

function renderKeywords(keywordStr?: string | null, isAr = false) {
  if (!keywordStr?.trim()) return null;
  const list = keywordStr.split(",").map((k) => k.trim()).filter(Boolean);
  if (list.length === 0) return null;
  return (
    <div dir="ltr" className="mt-4 flex flex-wrap gap-1.5 items-center">
      <span className="text-[10px] font-bold uppercase tracking-wider text-ink/40 me-1.5">
        {isAr ? "الكلمات المفتاحية:" : "Keywords:"}
      </span>
      {list.map((k) => (
        <span
          key={k}
          className="inline-flex items-center rounded-lg bg-surface border border-ink/10 dark:border-white/10 px-2.5 py-0.5 text-xs text-ink/80"
        >
          {k}
        </span>
      ))}
    </div>
  );
}

export default function PublicationDetailPage() {
  const t = useTranslations("PublicationDetail");
  const tWf = useTranslations("SubmissionWorkflow");
  const tApi = useTranslations("ApiErrors");
  const locale = useLocale();
  const { resolve: resolveApiError } = useApiErrorMessages();
  const { format: formatDiscipline } = useDisciplineLabel();
  const params = useParams();
  const routeSlug = params.slug as string;

  const {
    data,
    error,
    isPending,
    refetch,
  } = usePublicationDetail(routeSlug);

  const relatedSlug = data?.slug ?? routeSlug;
  const {
    data: related = [],
    isPending: relatedLoading,
  } = useRelatedPublications(relatedSlug, Boolean(data) && !error);

  const loadError = error
    ? resolveApiError(error, t("notFound"))
    : null;

  if (isPending && !loadError) {
    return (
      <main className={PAGE_SHELL_NARROW}>
        <Link href="/publications" className="text-sm text-accent hover:underline">
          {t("back")}
        </Link>
        <LoadingCenter label={t("loading")} className="mt-8 text-ink/70" />
      </main>
    );
  }

  if (loadError || !data) {
    const kind = error ? getApiErrorKind(error) : "generic";
    return (
      <ApiErrorState
        message={loadError ?? t("notFound")}
        error={error ?? undefined}
        title={kind === "notFound" ? t("notFound") : undefined}
        hint={kind === "rateLimit" ? tApi("rateLimitHint") : undefined}
        onRetry={() => void refetch()}
        retryLabel={tApi("retry")}
        backHref="/publications"
        backLabel={t("back")}
      />
    );
  }

  return (
    <main className={PAGE_SHELL_NARROW}>
      <Link href="/publications" className="group inline-flex items-center gap-1 text-sm text-accent hover:underline decoration-offset-2 select-none">
        <span className="transform transition-transform duration-200 group-hover:-translate-x-0.5 rtl:group-hover:translate-x-0.5">←</span>
        {t("back")}
      </Link>

      <div className="flex flex-wrap gap-2 items-center mt-6">
        {data.discipline ? (
          <span className="inline-flex items-center rounded-full bg-emerald-500/8 dark:bg-emerald-500/18 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-500 mr-1 rtl:ml-1 rtl:mr-0 animate-pulse" />
            {formatDiscipline(data.discipline)}
          </span>
        ) : null}
        {data.articleType ? (
          <span className="inline-flex items-center rounded-full bg-indigo-500/8 dark:bg-indigo-500/18 border border-indigo-500/20 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
            {tWf(`articleType_${data.articleType}`)}
          </span>
        ) : null}
      </div>

      <h1 className="mt-3 font-serif text-3xl font-bold leading-tight text-ink sm:text-4xl">
        {data.title}
      </h1>
      {data.titleAr?.trim() ? (
        <p
          dir="rtl"
          className="mt-3.5 font-serif text-2xl font-bold leading-snug text-ink/90"
        >
          {data.titleAr}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs font-semibold uppercase tracking-wider text-ink/50 pb-5 border-b border-ink/[0.08] dark:border-white/[0.08]">
        {data.author?.displayName ? (
          <div className="flex items-center gap-1.5">
            <svg className="size-4 text-accent-2 opacity-75" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
            <span>{data.author.displayName}</span>
          </div>
        ) : null}
        {data.publishedAt ? (
          <div className="flex items-center gap-1.5">
            <svg className="size-4 text-accent opacity-75" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008z" />
            </svg>
            <span>{formatMediumDate(data.publishedAt, locale)}</span>
          </div>
        ) : null}
      </div>

      <section className="mt-8 space-y-8 text-sm text-ink/85">
        {data.abstract ? (
          <div className="rounded-2xl border border-ink/[0.08] dark:border-white/[0.08] bg-surface/50 p-5 shadow-xs">
            <h2 className="text-xs font-bold uppercase tracking-wider text-ink/40">
              {tWf("abstractLabelEn")}
            </h2>
            <p dir="ltr" className="mt-3.5 leading-relaxed text-ink/80 whitespace-pre-wrap text-sm">
              {data.abstract}
            </p>
            {renderKeywords(data.keywords, false)}
          </div>
        ) : null}

        {data.abstractAr?.trim() ? (
          <div className="rounded-2xl border border-ink/[0.08] dark:border-white/[0.08] bg-surface/50 p-5 shadow-xs">
            <h2 className="text-xs font-bold uppercase tracking-wider text-ink/40">
              {tWf("abstractLabelAr")}
            </h2>
            <p dir="rtl" className="mt-3.5 leading-relaxed text-ink/80 whitespace-pre-wrap font-serif text-base">
              {data.abstractAr}
            </p>
            {renderKeywords(data.keywordsAr, true)}
          </div>
        ) : null}
      </section>

      {data.files?.length > 0 ? (
        <section className="mt-10 pt-6 border-t border-ink/[0.08] dark:border-white/[0.08]">
          <h2 className="font-serif text-lg font-bold text-ink flex items-center gap-2 mb-3.5">
            <span className="text-accent">📂</span>
            {t("files")}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.files.map((f) => (
              <li key={f.id}>
                <a
                  className="group/file flex items-center justify-between gap-4 rounded-xl border border-ink/10 dark:border-white/10 bg-surface/50 px-4 py-3.5 hover:border-accent/25 hover:shadow-xs transition-all duration-300"
                  href={`${getApiBase()}/api/v1/public/submissions/${encodeURIComponent(data.slug ?? routeSlug)}/files/${f.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <div className="min-w-0 flex items-center gap-2.5">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/8 text-accent group-hover/file:scale-105 transition-transform duration-200">
                      <svg className="size-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12h9m9 3H12m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    </div>
                    <span className="font-semibold text-xs text-ink/80 truncate group-hover/file:text-accent transition-colors duration-200" title={f.originalName}>
                      {f.originalName}
                    </span>
                  </div>
                  <svg className="size-4 shrink-0 text-ink/35 transition group-hover/file:text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <RelatedPublications items={related} loading={relatedLoading} />
    </main>
  );
}
