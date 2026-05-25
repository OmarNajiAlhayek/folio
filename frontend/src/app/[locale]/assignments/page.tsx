"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { apiJson, ApiError } from "@/lib/api";
import { ApiErrorState } from "@/components/api-error-state";
import { getApiErrorKind } from "@/lib/api-error-message";
import { redirectToLogin } from "@/lib/auth-redirect";
import { useAuthRedirect } from "@/lib/use-auth-redirect";
import { useApiErrorMessages } from "@/lib/use-api-error-messages";
import {
  AssignmentQueueRow,
  EMPTY_STATE_CLS,
  SubmissionListSkeleton,
  submissionQueueShellCls,
} from "@/lib/submission-list-ui";

type Row = {
  id: string;
  slug: string | null;
  status: string;
  assignedAt?: string;
  submission?: { id: string; title: string; status: string };
};

export default function AssignmentsPage() {
  const t = useTranslations("Assignments");
  const tSub = useTranslations("Submissions");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [items, setItems] = useState<Row[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorCause, setLoadErrorCause] = useState<unknown>(null);
  const [showRetry, setShowRetry] = useState(true);
  const [loading, setLoading] = useState(true);
  const { resolve: resolveApiError } = useApiErrorMessages();
  const tApi = useTranslations("ApiErrors");

  const loadList = useCallback(() => {
    setLoadError(null);
    setLoadErrorCause(null);
    apiJson<Row[]>("/assignments/me")
      .then((data) => {
        setItems(data);
        setShowRetry(true);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          redirectToLogin(router, pathname);
          return;
        }
        if (err instanceof ApiError && err.status === 403) {
          setLoadError(t("needReviewerRole"));
          setShowRetry(false);
          return;
        }
        setLoadErrorCause(err);
        setLoadError(resolveApiError(err, t("loadFailed")));
        setShowRetry(true);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [router, pathname, t, resolveApiError]);

  useAuthRedirect();

  useEffect(() => {
    void Promise.resolve().then(() => loadList());
  }, [loadList]);

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
        onRetry={
          showRetry
            ? () => {
                setLoading(true);
                loadList();
              }
            : undefined
        }
        retryLabel={showRetry ? tApi("retry") : undefined}
        disableRetry={!showRetry}
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

      {loading ? (
        <SubmissionListSkeleton />
      ) : items.length === 0 ? (
        <div className={EMPTY_STATE_CLS}>
          <p className="font-serif text-base text-ink">{t("empty")}</p>
          <p className="max-w-md text-sm text-ink/65">{t("emptyHint")}</p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {(() => {
            const invited = items.filter((a) => a.status === "invited");
            const active = items.filter((a) => a.status === "accepted");
            const past = items.filter(
              (a) => a.status !== "invited" && a.status !== "accepted",
            );
            const block = (sectionId: string, title: string, rows: Row[]) =>
              rows.length === 0 ? null : (
                <section key={sectionId} aria-labelledby={`assign-${sectionId}`}>
                  <h2
                    id={`assign-${sectionId}`}
                    className="font-sans text-xs font-semibold uppercase tracking-wider text-ink/50"
                  >
                    {title}
                  </h2>
                  <ul className="mt-3 space-y-3">
                    {rows.map((a) => (
                      <AssignmentQueueRow
                        key={a.id}
                        slug={a.slug}
                        title={a.submission?.title ?? t("submissionFallback")}
                        assignmentStatus={a.status}
                        submissionStatus={a.submission?.status ?? ""}
                        assignedAt={a.assignedAt}
                        locale={locale}
                        tAssign={t}
                        tSub={tSub}
                      />
                    ))}
                  </ul>
                </section>
              );
            return (
              <>
                {block("invited", t("sectionReviewInvitations"), invited)}
                {block("active", t("sectionActiveReviews"), active)}
                {block("past", t("sectionPastAssignments"), past)}
              </>
            );
          })()}
        </div>
      )}
    </main>
  );
}
