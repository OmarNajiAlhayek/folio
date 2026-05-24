"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { ApiError } from "@/lib/api";
import { getStoredToken } from "@/lib/api";
import { redirectToLogin } from "@/lib/auth-redirect";
import { useSubmissionsList } from "@/lib/queries/submissions";
import {
  EMPTY_STATE_CLS,
  SubmissionListSkeleton,
  SubmissionQueueRow,
  submissionQueueShellCls,
} from "@/lib/submission-list-ui";

export default function SubmissionsPage() {
  const t = useTranslations("Submissions");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const listQuery = useSubmissionsList();

  useEffect(() => {
    if (!getStoredToken()) {
      redirectToLogin(router, pathname);
    }
  }, [router, pathname]);

  const loadError =
    listQuery.isError && listQuery.error instanceof ApiError
      ? listQuery.error.message
      : listQuery.isError
        ? t("loadFailed")
        : null;

  const items = listQuery.data ?? [];
  const loading = listQuery.isLoading;

  if (loadError) {
    return (
      <main className={submissionQueueShellCls}>
        <div
          className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-red-800"
          role="alert"
        >
          <p>{loadError}</p>
          <button
            type="button"
            className="mt-3 rounded-lg border border-red-300 bg-paper px-3 py-1.5 text-sm font-medium text-red-900 hover:bg-red-50"
            onClick={() => void listQuery.refetch()}
          >
            {t("retryLoad")}
          </button>
        </div>
      </main>
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
        </div>
      </header>

      {loading ? (
        <SubmissionListSkeleton />
      ) : items.length === 0 ? (
        <div className={EMPTY_STATE_CLS}>
          <p className="font-serif text-base text-ink">{t("empty")}</p>
          <p className="max-w-md text-sm text-ink/65">{t("emptyHint")}</p>
          <Link
            href="/submissions/new"
            className="mt-1 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-95 hover:shadow-md"
          >
            {t("emptyCta")}
          </Link>
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
