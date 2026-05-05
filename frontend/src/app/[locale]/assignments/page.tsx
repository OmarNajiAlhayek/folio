"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { apiJson, getStoredToken, ApiError } from "@/lib/api";
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
  const router = useRouter();
  const [items, setItems] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getStoredToken()) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    apiJson<Row[]>("/assignments/me")
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        if (err instanceof ApiError && err.status === 403) {
          setError(t("needReviewerRole"));
          return;
        }
        setError(err instanceof ApiError ? err.message : t("loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router, t]);

  if (error) {
    return (
      <main className={submissionQueueShellCls}>
        <div
          className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-red-800"
          role="alert"
        >
          {error}
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
