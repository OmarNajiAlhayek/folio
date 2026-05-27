"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { apiJson, ApiError } from "@/lib/api";
import { ApiErrorState } from "@/components/api-error-state";
import { getApiErrorKind } from "@/lib/api-error-message";
import { redirectToLogin } from "@/lib/auth-redirect";
import { useApiErrorMessages } from "@/lib/use-api-error-messages";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  EMPTY_STATE_CLS,
  SubmissionListSkeleton,
  SubmissionQueueRow,
  submissionQueueShellCls,
  submissionStatusLabel,
} from "@/lib/submission-list-ui";

type Submission = {
  id: string;
  slug: string;
  title: string;
  status: string;
  updatedAt: string;
  disciplineSuggested?: string | null;
};

const EDITOR_FILTER_STATUSES = [
  "submitted",
  "under_review",
  "revisions_requested",
  "accepted",
  "rejected",
  "copyediting",
  "published",
] as const;

export default function EditorPage() {
  const t = useTranslations("Editor");
  const tSub = useTranslations("Submissions");
  const tUi = useTranslations("UI");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [items, setItems] = useState<Submission[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorCause, setLoadErrorCause] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const { resolve: resolveApiError } = useApiErrorMessages();
  const tApi = useTranslations("ApiErrors");

  const loadList = useCallback(() => {
    setLoadError(null);
    setLoadErrorCause(null);
    void (async () => {
      setLoading(true);
      try {
        const data = await apiJson<Submission[]>("/submissions");
        setItems(data);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          redirectToLogin(router, pathname);
          return;
        }
        setLoadErrorCause(err);
        setLoadError(resolveApiError(err, t("loadFailed")));
      } finally {
        setLoading(false);
      }
    })();
  }, [router, pathname, t, resolveApiError]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const statusOptions = useMemo(
    () =>
      EDITOR_FILTER_STATUSES.map((s) => ({
        value: s,
        label: submissionStatusLabel(s, tSub),
      })),
    [tSub],
  );

  const visibleItems = useMemo(() => {
    if (selectedStatuses.length === 0) return items;
    return items.filter((s) => selectedStatuses.includes(s.status));
  }, [items, selectedStatuses]);

  if (loadError) {
    return (
      <ApiErrorState
        className={submissionQueueShellCls}
        message={loadError}
        error={loadErrorCause}
        hint={
          loadErrorCause && getApiErrorKind(loadErrorCause) === "rateLimit"
            ? tApi("rateLimitHint")
            : undefined
        }
        onRetry={() => loadList()}
        retryLabel={tApi("retry")}
      />
    );
  }

  return (
    <main className={submissionQueueShellCls}>
      <header className="border-s-4 border-s-accent/35 ps-5">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            {t("title")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink/70">
            {t("hint")}
          </p>
        </div>
      </header>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink/80">
          <span id="editor-status-filter-label">{t("statusFilter")}</span>
          <MultiSelect
            options={statusOptions}
            value={selectedStatuses}
            onChange={setSelectedStatuses}
            emptyLabel={tUi("allStatuses")}
            manySelectedLabel={(c) => tUi("nSelected", { count: c })}
            className="min-w-[14rem] max-w-[min(100%,20rem)]"
            aria-labelledby="editor-status-filter-label"
          />
        </div>
      </div>

      {loading ? (
        <SubmissionListSkeleton />
      ) : items.length === 0 || visibleItems.length === 0 ? (
        <div className={EMPTY_STATE_CLS}>
          <p className="font-serif text-base text-ink">{t("empty")}</p>
          {items.length > 0 && visibleItems.length === 0 && (
            <p className="text-sm text-ink/60">{t("statusFilter")}</p>
          )}
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {visibleItems.map((s) => (
            <SubmissionQueueRow
              key={s.id}
              href={`/submissions/${encodeURIComponent(s.slug)}`}
              title={s.title}
              status={s.status}
              updatedAt={s.updatedAt}
              locale={locale}
              t={tSub}
              disciplineSuggested={s.disciplineSuggested}
            />
          ))}
        </ul>
      )}
    </main>
  );
}
