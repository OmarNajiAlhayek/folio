"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { apiJson, getStoredToken, ApiError } from "@/lib/api";
import { redirectToLogin } from "@/lib/auth-redirect";
import {
  EMPTY_STATE_CLS,
  SubmissionListSkeleton,
  submissionQueueShellCls,
  statusPillClass,
  submissionStatusLabel,
} from "@/lib/submission-list-ui";
import { Link } from "@/i18n/navigation";

type Row = {
  id: string;
  slug: string | null;
  status: string;
  assignedAt?: string;
  submission?: { title: string; status: string; slug?: string };
};

export default function CopyeditAssignmentsPage() {
  const t = useTranslations("Copyedit");
  const tSub = useTranslations("Submissions");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [items, setItems] = useState<Row[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadList = useCallback(() => {
    setLoadError(null);
    apiJson<Row[]>("/copyedit-assignments/me")
      .then((data) => setItems(data))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          redirectToLogin(router, pathname);
          return;
        }
        if (err instanceof ApiError && err.status === 403) {
          setLoadError(t("needCopyeditorRole"));
          return;
        }
        setLoadError(err instanceof ApiError ? err.message : t("loadFailed"));
      })
      .finally(() => setLoading(false));
  }, [router, pathname, t]);

  useEffect(() => {
    if (!getStoredToken()) {
      redirectToLogin(router, pathname);
      return;
    }
    void Promise.resolve().then(() => loadList());
  }, [router, pathname, loadList]);

  if (loadError) {
    return (
      <main className={submissionQueueShellCls}>
        <p className="text-red-700" role="alert">
          {loadError}
        </p>
      </main>
    );
  }

  return (
    <main className={submissionQueueShellCls}>
      <header className="border-s-4 border-s-accent/35 ps-5">
        <h1 className="font-serif text-3xl font-semibold text-ink">
          {t("queueTitle")}
        </h1>
        <p className="mt-2 text-sm text-ink/70">{t("queueHint")}</p>
      </header>

      {loading ? (
        <SubmissionListSkeleton />
      ) : items.length === 0 ? (
        <div className={EMPTY_STATE_CLS}>
          <p>{t("queueEmpty")}</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {items.map((a) => (
            <li key={a.id}>
              <Link
                href={a.slug ? `/copyedit-assignments/${a.slug}` : "#"}
                className="block rounded-xl border border-ink/10 bg-surface p-4 shadow-sm hover:border-accent/30"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-ink">
                    {a.submission?.title ?? t("submissionFallback")}
                  </span>
                  <span className={statusPillClass(a.status)}>
                    {t(`assignmentStatus_${a.status}` as "assignmentStatus_active")}
                  </span>
                </div>
                {a.submission?.status ? (
                  <span className="mt-1 inline-block text-xs text-ink/60">
                    {submissionStatusLabel(a.submission.status, tSub)}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
