"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useState } from "react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import { apiBlob, apiJson, ApiError, getStoredToken } from "@/lib/api";
import { redirectToLogin } from "@/lib/auth-redirect";
import { toast, toastApiError } from "@/lib/toast";
import { PAGE_SHELL } from "@/lib/page-shell";
import { cn } from "@/lib/utils";
import {
  createReviewSchema,
  formatZodIssues,
  joinValidationBulletList,
  safeParseResult,
} from "@/lib/validation";

const recs = ["accept", "reject", "revisions"] as const;
type Rec = (typeof recs)[number];

const ABSTRACT_PREVIEW_LEN = 420;

type ReviewFileRow = {
  id: string;
  originalName: string;
  mimeType: string;
  kind?: string;
  fileStage?: string;
};

type AssignmentRow = {
  id: string;
  slug: string | null;
  status: string;
  submission?: {
    id: string;
    title: string;
    titleAr?: string | null;
    status: string;
    slug?: string | null;
    abstract?: string;
    abstractAr?: string | null;
    files?: ReviewFileRow[];
  };
};

type SubmissionStatusMsg =
  | "stDraft"
  | "stSubmitted"
  | "stUnderReview"
  | "stRevisions"
  | "stAccepted"
  | "stRejected"
  | "stPublished";

function submissionStatusKey(status: string): SubmissionStatusMsg | null {
  const map: Record<string, SubmissionStatusMsg> = {
    draft: "stDraft",
    submitted: "stSubmitted",
    under_review: "stUnderReview",
    revisions_requested: "stRevisions",
    accepted: "stAccepted",
    rejected: "stRejected",
    published: "stPublished",
  };
  return map[status] ?? null;
}

function ReviewSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-4 w-32 rounded bg-ink/10" />
      <div className="h-9 w-2/3 max-w-md rounded bg-ink/10" />
      <div className="flex flex-col gap-6">
        <div className="rounded-xl border border-ink/10 bg-surface p-6 shadow-sm">
          <div className="h-5 w-24 rounded bg-ink/10" />
          <div className="mt-4 h-8 w-full rounded bg-ink/10" />
          <div className="mt-4 h-4 w-28 rounded bg-ink/10" />
          <div className="mt-3 space-y-2">
            <div className="h-3 w-full rounded bg-ink/10" />
            <div className="h-3 w-full rounded bg-ink/10" />
            <div className="h-3 w-4/5 rounded bg-ink/10" />
          </div>
        </div>
        <div className="rounded-xl border border-ink/10 bg-surface p-6 shadow-sm">
          <div className="h-5 w-32 rounded bg-ink/10" />
          <div className="mt-6 space-y-3">
            <div className="h-16 w-full rounded-lg bg-ink/10" />
            <div className="h-16 w-full rounded-lg bg-ink/10" />
            <div className="h-16 w-full rounded-lg bg-ink/10" />
          </div>
          <div className="mt-6 h-32 w-full rounded-lg bg-ink/10" />
          <div className="mt-6 h-11 w-full rounded-lg bg-ink/10" />
        </div>
      </div>
    </div>
  );
}

export default function ReviewFormPage() {
  const t = useTranslations("AssignmentsReview");
  const tv = useTranslations("Validation");
  const tCommon = useTranslations("Common");
  const tSub = useTranslations("Submissions");
  const tAssignments = useTranslations("Assignments");
  const tWf = useTranslations("SubmissionWorkflow");
  const params = useParams();
  const slug = params.slug as string;
  const pathname = usePathname();
  const router = useRouter();
  const recGroupId = useId();

  const [commentsForAuthor, setCommentsForAuthor] = useState("");
  const [commentsToEditorOnly, setCommentsToEditorOnly] = useState("");
  const [recommendation, setRecommendation] = useState<Rec>("accept");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [abstractExpandedEn, setAbstractExpandedEn] = useState(false);
  const [abstractExpandedAr, setAbstractExpandedAr] = useState(false);

  const [pageLoading, setPageLoading] = useState(true);
  const [contextError, setContextError] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<AssignmentRow | null>(null);
  const [contextMissing, setContextMissing] = useState<
    "notFound" | "invited" | "notOpen" | null
  >(null);

  const loadContext = useCallback(async () => {
    setPageLoading(true);
    setContextError(null);
    setContextMissing(null);
    setAssignment(null);
    try {
      const items = await apiJson<AssignmentRow[]>("/assignments/me");
      const row = items.find((a) => a.slug === slug);
      if (!row) {
        setContextMissing("notFound");
        return;
      }
      if (row.status === "invited") {
        setAssignment(row);
        setContextMissing("invited");
        return;
      }
      if (row.status !== "accepted") {
        setAssignment(row);
        setContextMissing("notOpen");
        return;
      }
      setAssignment(row);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        redirectToLogin(router, pathname);
        return;
      }
      if (err instanceof ApiError && err.status === 403) {
        setContextError(tAssignments("needReviewerRole"));
        return;
      }
      setContextError(err instanceof ApiError ? err.message : t("loadFailed"));
    } finally {
      setPageLoading(false);
    }
  }, [slug, router, pathname, t, tAssignments]);

  useEffect(() => {
    if (!getStoredToken()) {
      redirectToLogin(router, pathname);
      return;
    }
    loadContext().catch(() => {
      setContextError(t("loadFailed"));
      setPageLoading(false);
    });
  }, [loadContext, router, pathname, t]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const parsed = safeParseResult(createReviewSchema, {
      commentsForAuthor,
      commentsToEditorOnly,
      recommendation,
    });
    if (!parsed.ok) {
      setSubmitError(
        joinValidationBulletList(formatZodIssues(tv, parsed.error.issues)),
      );
      return;
    }
    setSubmitting(true);
    try {
      await apiJson(`/assignments/${encodeURIComponent(slug)}/reviews`, {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      router.push("/assignments");
    } catch (err) {
      toastApiError(err, t("submitFailed"), { id: "assignment-review-submit" });
    } finally {
      setSubmitting(false);
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

  const statusKey = sub ? submissionStatusKey(sub.status) : null;
  const statusLabel =
    statusKey != null ? tSub(statusKey) : sub?.status ?? "—";

  const recHint = (r: Rec) =>
    r === "accept"
      ? t("recHintAccept")
      : r === "reject"
        ? t("recHintReject")
        : t("recHintRevisions");

  async function downloadReviewFile(file: ReviewFileRow) {
    const slug = sub?.slug;
    if (!slug) return;
    try {
      const blob = await apiBlob(
        `/submissions/${encodeURIComponent(slug)}/files/${file.id}`,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.originalName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("downloadFailed"), { id: "assignment-review-download" });
    }
  }

  const showForm =
    assignment && assignment.status === "accepted" && !contextMissing;

  return (
    <main className={PAGE_SHELL}>
      <Link
        href="/assignments"
        className="text-sm font-medium text-accent hover:underline"
      >
        {t("back")}
      </Link>

      {pageLoading && (
        <div className="mt-6">
          <ReviewSkeleton />
        </div>
      )}

      {!pageLoading && contextError && (
        <div className="mt-8 rounded-xl border border-red-200 bg-red-50/90 p-5 shadow-sm">
          <p className="text-sm text-red-900">{contextError}</p>
          <button
            type="button"
            className="mt-4 rounded-md border border-red-300 bg-paper px-3 py-1.5 text-sm font-medium text-red-900 hover:bg-red-50"
            onClick={() => void loadContext()}
          >
            {t("retryLoad")}
          </button>
          <Link
            href="/assignments"
            className="mt-4 inline-block text-sm font-medium text-accent hover:underline"
          >
            {t("backToAssignments")}
          </Link>
        </div>
      )}

      {!pageLoading && !contextError && contextMissing === "notFound" && (
        <div className="mt-8 rounded-xl border border-ink/10 bg-surface p-8 text-center shadow-sm">
          <p className="text-ink/80">{t("notFound")}</p>
          <Link
            href="/assignments"
            className="mt-6 inline-block rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white hover:opacity-95"
          >
            {t("backToAssignments")}
          </Link>
        </div>
      )}

      {!pageLoading && !contextError && contextMissing === "invited" && assignment && (
        <div className="mt-8 rounded-xl border border-ink/10 bg-surface p-8 shadow-sm">
          <p className="font-serif text-lg text-ink">
            {sub?.title ?? tAssignments("submissionFallback")}
          </p>
          <p className="mt-4 text-sm text-ink/75">{t("acceptInvitationFirst")}</p>
          <Link
            href={`/assignments/${encodeURIComponent(slug)}/invite`}
            className="mt-6 inline-block rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white hover:opacity-95"
          >
            {t("goToInvitation")}
          </Link>
          <Link
            href="/assignments"
            className="mt-4 ms-4 inline-block text-sm font-medium text-accent hover:underline"
          >
            {t("backToAssignments")}
          </Link>
        </div>
      )}

      {!pageLoading && !contextError && contextMissing === "notOpen" && assignment && (
        <div className="mt-8 rounded-xl border border-ink/10 bg-surface p-8 shadow-sm">
          <p className="font-serif text-lg text-ink">{sub?.title ?? tAssignments("submissionFallback")}</p>
          <p className="mt-4 text-sm text-ink/75">{t("notPending")}</p>
          <Link
            href="/assignments"
            className="mt-6 inline-block text-sm font-medium text-accent hover:underline"
          >
            {t("backToAssignments")}
          </Link>
        </div>
      )}

      {!pageLoading && !contextError && showForm && (
        <>
          <p className="mt-6 font-sans text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            {t("eyebrow")}
          </p>
          <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            {t("title")}
          </h1>

          <div className="mt-10 flex flex-col gap-8">
            <section
              className="rounded-xl border border-ink/10 bg-surface p-6 shadow-sm sm:p-8"
              aria-labelledby="manuscript-heading"
            >
              <h2
                id="manuscript-heading"
                className="font-sans text-xs font-semibold uppercase tracking-wider text-ink/50"
              >
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
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-ink/50">
                  {t("submissionStatus")}
                </span>
                <span className="rounded-full border border-ink/15 bg-paper px-2.5 py-0.5 text-xs font-medium text-ink">
                  {statusLabel}
                </span>
              </div>
              {hasAnyAbstract ? (
                <div className="mt-6 space-y-6">
                  {abstractEn ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                        {tWf("abstractLabelEn")}
                      </p>
                      <p
                        dir="ltr"
                        className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/85"
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
                        className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/85"
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
                <p className="mt-6 text-sm italic text-ink/45">—</p>
              )}
              {sub?.files && sub.files.length > 0 ? (
                <div className="mt-8">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                    {t("reviewPackageFiles")}
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {sub.files.map((file) => (
                      <li
                        key={file.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink/10 bg-paper/50 px-3 py-2 text-sm"
                      >
                        <span className="min-w-0 truncate text-ink" title={file.originalName}>
                          {file.originalName}
                        </span>
                        <button
                          type="button"
                          onClick={() => void downloadReviewFile(file)}
                          className="shrink-0 rounded-md border border-ink/15 bg-paper px-3 py-1.5 text-xs font-medium text-ink hover:border-accent/40"
                        >
                          {t("downloadFile")}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {sub?.slug ? (
                <Link
                  href={`/submissions/${encodeURIComponent(sub.slug)}`}
                  className="mt-8 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
                >
                  {t("viewFullManuscript")}
                  <span aria-hidden>→</span>
                </Link>
              ) : null}
            </section>

            <section
              className="rounded-xl border border-ink/10 bg-surface p-6 shadow-sm sm:p-8"
              aria-labelledby="review-form-heading"
            >
              <h2
                id="review-form-heading"
                className="font-serif text-xl font-semibold text-ink"
              >
                {t("formSection")}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink/65">
                {t("commentsForAuthorHint")} {t("commentsToEditorOnlyHint")}
              </p>

              <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-8">
                {submitError && (
                  <div
                    className="flex gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
                    role="alert"
                  >
                    <span className="mt-0.5 shrink-0 text-red-600" aria-hidden>
                      <svg className="size-5" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                    <span>{submitError}</span>
                  </div>
                )}

                <fieldset className="min-w-0 border-0 p-0">
                  <legend className="text-sm font-semibold text-ink">
                    {t("recommendation")}
                  </legend>
                  <div
                    className="mt-3 flex flex-col gap-3"
                    role="radiogroup"
                    aria-label={t("recommendation")}
                  >
                    {recs.map((r) => {
                      const label =
                        r === "accept"
                          ? tCommon("recAccept")
                          : r === "reject"
                            ? tCommon("recReject")
                            : tCommon("recRevisions");
                      const id = `${recGroupId}-${r}`;
                      return (
                        <label
                          key={r}
                          htmlFor={id}
                          className={cn(
                            "relative cursor-pointer rounded-lg border border-ink/12 bg-paper/80 p-4 transition-colors",
                            "has-focus-visible:ring-2 has-focus-visible:ring-accent/35 has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-white",
                            recommendation === r &&
                              "border-accent/35 bg-accent/5 ring-2 ring-accent/25",
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              id={id}
                              type="radio"
                              name="recommendation"
                              value={r}
                              checked={recommendation === r}
                              onChange={() => setRecommendation(r)}
                              className="mt-1 size-4 shrink-0 border-ink/25 text-accent accent-accent focus:ring-2 focus:ring-accent/35 focus:ring-offset-2"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-ink">
                                {label}
                              </span>
                              <span className="mt-1 block text-xs leading-relaxed text-ink/60">
                                {recHint(r)}
                              </span>
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-ink">
                    {t("commentsForAuthor")}
                  </span>
                  <span className="text-xs text-ink/60">{t("commentsForAuthorHint")}</span>
                  <textarea
                    rows={8}
                    value={commentsForAuthor}
                    onChange={(e) => setCommentsForAuthor(e.target.value)}
                    className={cn(
                      "resize-y rounded-lg border border-ink/15 bg-surface px-3 py-3 text-sm leading-relaxed text-ink",
                      "outline-none focus-visible:border-accent/40 focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
                    )}
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-ink">
                    {t("commentsToEditorOnly")}
                  </span>
                  <span className="text-xs text-ink/60">{t("commentsToEditorOnlyHint")}</span>
                  <textarea
                    rows={6}
                    value={commentsToEditorOnly}
                    onChange={(e) => setCommentsToEditorOnly(e.target.value)}
                    className={cn(
                      "resize-y rounded-lg border border-ink/15 bg-surface px-3 py-3 text-sm leading-relaxed text-ink",
                      "outline-none focus-visible:border-accent/40 focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
                    )}
                  />
                </label>

                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-accent py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? t("sending") : t("submit")}
                </button>
              </form>
            </section>
          </div>
        </>
      )}

    </main>
  );
}
