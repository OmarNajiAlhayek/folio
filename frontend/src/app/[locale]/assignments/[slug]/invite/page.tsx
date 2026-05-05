"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import { apiJson, getStoredToken, ApiError } from "@/lib/api";
import { PAGE_SHELL } from "@/lib/page-shell";

type AssignmentRow = {
  id: string;
  slug: string | null;
  status: string;
  submission?: {
    id: string;
    title: string;
    titleAr?: string | null;
    status: string;
    abstract?: string;
    abstractAr?: string | null;
  };
};

const ABSTRACT_PREVIEW_LEN = 420;

export default function AssignmentInvitePage() {
  const t = useTranslations("AssignmentsInvite");
  const tAssignments = useTranslations("Assignments");
  const tWf = useTranslations("SubmissionWorkflow");
  const params = useParams();
  const slug = params.slug as string;
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<AssignmentRow | null>(null);
  const [abstractExpandedEn, setAbstractExpandedEn] = useState(false);
  const [abstractExpandedAr, setAbstractExpandedAr] = useState(false);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAssignment(null);
    try {
      const items = await apiJson<AssignmentRow[]>("/assignments/me");
      const row = items.find((a) => a.slug === slug);
      if (!row) {
        setError(t("notFound"));
        return;
      }
      if (row.status !== "invited") {
        setError(t("notInvited"));
        return;
      }
      setAssignment(row);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/login");
        return;
      }
      if (err instanceof ApiError && err.status === 403) {
        setError(tAssignments("needReviewerRole"));
        return;
      }
      setError(err instanceof ApiError ? err.message : t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [slug, router, t, tAssignments]);

  useEffect(() => {
    if (!getStoredToken()) {
      router.replace("/login");
      return;
    }
    void load();
  }, [load, router]);

  async function accept() {
    setActionError(null);
    setActing(true);
    try {
      await apiJson(`/assignments/${encodeURIComponent(slug)}/accept`, {
        method: "POST",
      });
      router.push(`/assignments/${encodeURIComponent(slug)}/review`);
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : t("actionFailed"),
      );
    } finally {
      setActing(false);
    }
  }

  async function decline() {
    setActionError(null);
    setActing(true);
    try {
      await apiJson(`/assignments/${encodeURIComponent(slug)}/decline`, {
        method: "POST",
      });
      router.push("/assignments");
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : t("actionFailed"),
      );
    } finally {
      setActing(false);
    }
  }

  const sub = assignment?.submission;
  const abstractEn = sub?.abstract?.trim() ?? "";
  const abstractArText = sub?.abstractAr?.trim() ?? "";
  const enLong = abstractEn.length > ABSTRACT_PREVIEW_LEN;
  const abstractEnShown =
    abstractExpandedEn || !enLong
      ? abstractEn
      : `${abstractEn.slice(0, ABSTRACT_PREVIEW_LEN).trim()}…`;
  const arLong = abstractArText.length > ABSTRACT_PREVIEW_LEN;
  const abstractArShown =
    abstractExpandedAr || !arLong
      ? abstractArText
      : `${abstractArText.slice(0, ABSTRACT_PREVIEW_LEN).trim()}…`;
  const hasAnyAbstract = abstractEn.length > 0 || abstractArText.length > 0;

  return (
    <main className={PAGE_SHELL}>
      <Link
        href="/assignments"
        className="text-sm font-medium text-accent hover:underline"
      >
        {t("back")}
      </Link>

      {loading && (
        <div className="mt-8 animate-pulse space-y-4">
          <div className="h-8 w-2/3 max-w-md rounded bg-ink/10" />
          <div className="h-24 rounded-xl border border-ink/10 bg-surface" />
        </div>
      )}

      {!loading && error && (
        <div className="mt-8 rounded-xl border border-ink/10 bg-surface p-8 shadow-sm">
          <p className="text-sm text-ink/80">{error}</p>
          <Link
            href="/assignments"
            className="mt-6 inline-block text-sm font-medium text-accent hover:underline"
          >
            {t("backToAssignments")}
          </Link>
        </div>
      )}

      {!loading && !error && assignment && (
        <>
          <p className="mt-6 font-sans text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            {t("eyebrow")}
          </p>
          <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            {t("title")}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink/70">
            {t("hint")}
          </p>

          <section className="mt-10 rounded-xl border border-ink/10 bg-surface p-6 shadow-sm sm:p-8">
            <h2 className="font-sans text-xs font-semibold uppercase tracking-wider text-ink/50">
              {t("manuscriptSection")}
            </h2>
            <div className="mt-4">
              <p className="font-serif text-xl font-semibold leading-snug text-ink sm:text-2xl">
                {sub?.title ?? tAssignments("submissionFallback")}
              </p>
              {sub?.titleAr?.trim() ? (
                <p
                  dir="rtl"
                  className="mt-2 font-serif text-lg font-semibold leading-snug text-ink/95"
                >
                  {sub.titleAr}
                </p>
              ) : null}
            </div>
            {hasAnyAbstract ? (
              <div className="mt-4 space-y-6">
                {abstractEn ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                      {tWf("abstractLabelEn")}
                    </p>
                    <p
                      dir="ltr"
                      className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/80"
                    >
                      {abstractEnShown}
                    </p>
                    {enLong ? (
                      <button
                        type="button"
                        onClick={() => setAbstractExpandedEn((v) => !v)}
                        className="mt-2 text-sm font-medium text-accent hover:underline"
                      >
                        {abstractExpandedEn
                          ? t("showLessAbstract")
                          : t("showMoreAbstract")}
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {abstractArText ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                      {tWf("abstractLabelAr")}
                    </p>
                    <p
                      dir="rtl"
                      className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/80"
                    >
                      {abstractArShown}
                    </p>
                    {arLong ? (
                      <button
                        type="button"
                        onClick={() => setAbstractExpandedAr((v) => !v)}
                        className="mt-2 text-sm font-medium text-accent hover:underline"
                      >
                        {abstractExpandedAr
                          ? t("showLessAbstract")
                          : t("showMoreAbstract")}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-4 text-sm text-ink/55">{t("noAbstract")}</p>
            )}
            <p className="mt-6 text-xs text-ink/50">
              {t("fullManuscriptAfterAccept")}
            </p>
          </section>

          {actionError ? (
            <p
              className="mt-4 text-sm text-red-700"
              role="alert"
            >
              {actionError}
            </p>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={acting}
              onClick={() => void accept()}
              className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:opacity-95 disabled:opacity-50"
            >
              {acting ? t("working") : t("accept")}
            </button>
            <button
              type="button"
              disabled={acting}
              onClick={() => void decline()}
              className="rounded-lg border border-ink/20 bg-paper px-5 py-2.5 text-sm font-medium text-ink hover:bg-ink/5 disabled:opacity-50"
            >
              {t("decline")}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
