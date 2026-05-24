"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { apiJson, getStoredToken, ApiError } from "@/lib/api";
import { redirectToLogin } from "@/lib/auth-redirect";
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
  const [loading, setLoading] = useState(true);

  const loadList = useCallback(() => {
    setLoadError(null);
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
        setLoadError(err instanceof ApiError ? err.message : t("loadFailed"));
      } finally {
        setLoading(false);
      }
    })();
  }, [router, pathname, t]);

  useEffect(() => {
    if (!getStoredToken()) {
      redirectToLogin(router, pathname);
      return;
    }
    loadList();
  }, [router, pathname, loadList]);

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
      <main className={submissionQueueShellCls}>
        <div
          className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-red-800"
          role="alert"
        >
          <p>{loadError}</p>
          <button
            type="button"
            className="mt-3 rounded-lg border border-red-300 bg-paper px-3 py-1.5 text-sm font-medium text-red-900 hover:bg-red-50"
            onClick={() => loadList()}
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
            />
          ))}
        </ul>
      )}
    </main>
  );
}
