"use client";

import { useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { ApiErrorState } from "@/components/api-error-state";
import { getApiErrorKind } from "@/lib/api-error-message";
import { useApiErrorMessages } from "@/lib/use-api-error-messages";
import { useMe } from "@/lib/queries/auth";
import { canManageOwnSubmissions } from "@/lib/permissions";
import { useSubmissionsList } from "@/lib/queries/submissions";
import { LoadingCenter } from "@/components/ui/spinner";
import {
  SubmissionListSkeleton,
  SubmissionQueueRow,
  submissionQueueShellCls,
} from "@/lib/submission-list-ui";

export default function SubmissionsPage() {
  const t = useTranslations("Submissions");
  const tCommon = useTranslations("Common");
  const tApi = useTranslations("ApiErrors");
  const locale = useLocale();
  const router = useRouter();
  const { resolve: resolveApiError } = useApiErrorMessages();
  const meQuery = useMe();
  const canManageOwn = meQuery.data
    ? canManageOwnSubmissions(meQuery.data.permissions)
    : false;

  useEffect(() => {
    if (
      meQuery.isSuccess &&
      meQuery.data &&
      !canManageOwnSubmissions(meQuery.data.permissions)
    ) {
      router.replace("/dashboard");
    }
  }, [meQuery.isSuccess, meQuery.data, router]);

  const listQuery = useSubmissionsList();

  const loadError = listQuery.isError
    ? resolveApiError(listQuery.error, t("loadFailed"))
    : null;

  const items = listQuery.data ?? [];
  const loading = listQuery.isLoading;

  // Real-time metrics calculations
  const draftsCount = items.filter((s) => s.status === "draft").length;
  const inReviewCount = items.filter((s) =>
    ["submitted", "under_review", "revisions_requested"].includes(s.status),
  ).length;
  const decisionsCount = items.filter((s) =>
    ["accepted", "copyediting", "published"].includes(s.status),
  ).length;

  const isAr = locale === "ar";

  if (meQuery.isLoading || (meQuery.isSuccess && !canManageOwn)) {
    return (
      <main className={submissionQueueShellCls}>
        <LoadingCenter label={tCommon("loading")} className="text-ink/60" />
      </main>
    );
  }

  if (loadError) {
    return (
      <ApiErrorState
        className={submissionQueueShellCls}
        message={loadError}
        error={listQuery.error}
        hint={
          listQuery.error && getApiErrorKind(listQuery.error) === "rateLimit"
            ? tApi("rateLimitHint")
            : undefined
        }
        onRetry={() => void listQuery.refetch()}
        retryLabel={tApi("retry")}
      />
    );
  }

  return (
    <main className={submissionQueueShellCls}>
      {/* Background Grid Canvas Overlay */}
      <div 
        className="pointer-events-none absolute inset-0 opacity-[0.02] dark:opacity-[0.01]"
        style={{
          backgroundImage: `linear-gradient(var(--accent) 1px, transparent 1px), linear-gradient(90deg, var(--accent) 1px, transparent 1px)`,
          backgroundSize: '24px 24px'
        }}
        aria-hidden
      />

      <header className="relative border-s-4 border-s-accent/70 ps-5 mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="text-start">
            <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              {t("title")}
            </h1>
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-ink/65">
              {t("hint")}
            </p>
          </div>
          {canManageOwn && (
            <Link
              href="/submissions/new"
              className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:brightness-105 active:scale-[0.98] transition-all duration-200"
            >
              <svg
                className="size-4 shrink-0"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden
              >
                <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
              </svg>
              {t("newDraft")}
            </Link>
          )}
        </div>
      </header>

      {/* Dynamic Summary Cards to add wow factor and visual structure */}
      {!loading && items.length > 0 && (
        <div className="relative grid grid-cols-3 gap-3 md:gap-4 mb-6 pt-2">
          
          {/* Drafts Summary */}
          <div className="rounded-xl border border-slate-500/10 bg-slate-500/5 px-3 py-3.5 text-center shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block truncate">
              {isAr ? "المسودات المؤقتة" : "Saved Drafts"}
            </span>
            <span className="font-serif text-2xl font-bold text-slate-700 dark:text-slate-300 mt-1 block">
              {draftsCount}
            </span>
          </div>

          {/* Evaluation Queue Summary */}
          <div className="rounded-xl border border-amber-500/10 bg-amber-500/5 px-3 py-3.5 text-center shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 block truncate">
              {isAr ? "تحت التقييم" : "In Evaluation"}
            </span>
            <span className="font-serif text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1 block animate-pulse">
              {inReviewCount}
            </span>
          </div>

          {/* Completed catalog Decisions */}
          <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/5 px-3 py-3.5 text-center shadow-2xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 block truncate">
              {isAr ? "المقبولة للنشر" : "Accepted Papers"}
            </span>
            <span className="font-serif text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-1 block">
              {decisionsCount}
            </span>
          </div>

        </div>
      )}

      {/* List content / Custom onboarding empty states */}
      {loading ? (
        <SubmissionListSkeleton />
      ) : items.length === 0 ? (
        /* Visual Onboarding State replacing generic blank whitespace */
        <div className="relative flex flex-col items-center justify-center text-center p-8 rounded-2xl border border-dashed border-ink/15 dark:border-white/15 bg-linear-to-b from-surface/50 to-surface-muted/20">
          <div className="relative flex items-center justify-center size-16 rounded-full bg-accent/8 border border-accent/15 text-accent mb-5">
            <span className="absolute inset-0 rounded-full bg-accent/8 animate-pulse" />
            <svg className="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>

          <h2 className="font-serif text-lg font-bold text-ink">
            {t("empty")}
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-ink/60 max-w-xs">
            {t("emptyHint")}
          </p>
          
          {canManageOwn && (
            <Link
              href="/submissions/new"
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:brightness-105 active:scale-[0.98] transition-all duration-200"
            >
              {t("emptyCta")}
            </Link>
          )}
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {items.map((s) => (
            <SubmissionQueueRow
              key={s.id}
              href={`/submissions/${encodeURIComponent(s.slug)}`}
              title={s.title}
              status={s.status}
              updatedAt={s.updatedAt}
              locale={locale}
              t={t}
            />
          ))}
        </ul>
      )}
    </main>
  );
}
