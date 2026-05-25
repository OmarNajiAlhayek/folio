"use client";

import { useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { ApiErrorState } from "@/components/api-error-state";
import { getApiErrorKind } from "@/lib/api-error-message";
import { useApiErrorMessages } from "@/lib/use-api-error-messages";
import { useMe } from "@/lib/queries/auth";
import {
  canBrowseSubmissionsNav,
  canManageOwnSubmissions,
} from "@/lib/permissions";
import { useSubmissionsList } from "@/lib/queries/submissions";
import {
  EMPTY_STATE_CLS,
  SubmissionListSkeleton,
  SubmissionQueueRow,
  submissionQueueShellCls,
} from "@/lib/submission-list-ui";

export default function SubmissionsPage() {
  const t = useTranslations("Submissions");
  const tApi = useTranslations("ApiErrors");
  const locale = useLocale();
  const router = useRouter();
  const { resolve: resolveApiError } = useApiErrorMessages();
  const meQuery = useMe();
  const canBrowse = meQuery.data
    ? canBrowseSubmissionsNav(meQuery.data.permissions)
    : false;
  const canCreate = meQuery.data
    ? canManageOwnSubmissions(meQuery.data.permissions)
    : false;

  useEffect(() => {
    if (meQuery.isSuccess && meQuery.data && !canBrowseSubmissionsNav(meQuery.data.permissions)) {
      router.replace("/dashboard");
    }
  }, [meQuery.isSuccess, meQuery.data, router]);

  const listQuery = useSubmissionsList();

  const loadError = listQuery.isError
    ? resolveApiError(listQuery.error, t("loadFailed"))
    : null;

  const items = listQuery.data ?? [];
  const loading = listQuery.isLoading;

  if (meQuery.isLoading || (meQuery.isSuccess && !canBrowse)) {
    return (
      <main className={submissionQueueShellCls}>
        <p className="text-ink/60">Loading…</p>
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
      <header className="border-s-4 border-s-accent/35 ps-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="text-start">
            <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              {t("title")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink/70">
              {t("hint")}
            </p>
          </div>
          {canCreate && (
            <Link
              href="/submissions/new"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:opacity-95 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <svg
                className="size-4 opacity-90"
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

      {loading ? (
        <SubmissionListSkeleton />
      ) : items.length === 0 ? (
        <div className={EMPTY_STATE_CLS}>
          <p className="font-serif text-base text-ink">{t("empty")}</p>
          <p className="max-w-md text-sm text-ink/65">{t("emptyHint")}</p>
          {canCreate && (
            <Link
              href="/submissions/new"
              className="mt-1 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-95 hover:shadow-md"
            >
              {t("emptyCta")}
            </Link>
          )}
        </div>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
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
