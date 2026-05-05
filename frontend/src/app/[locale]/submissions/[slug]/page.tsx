"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useCallback, useId } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import {
  apiJson,
  apiUpload,
  getStoredToken,
  getApiBase,
  ApiError,
} from "@/lib/api";
import type { MeProfile } from "@/lib/permissions";
import { PERMISSION_SLUGS } from "@/lib/permissions";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SimpleSelect } from "@/components/ui/select";
import {
  assignmentStatusLabel,
  assignmentStatusPillClass,
  statusPillClass,
  submissionStatusLabel,
  submissionQueueShellCls,
} from "@/lib/submission-list-ui";
import { PAGE_SHELL_NARROW } from "@/lib/page-shell";
import {
  assignReviewerSchema,
  fileExceedsUploadLimit,
  formatZodIssues,
  joinValidationBulletList,
  MAX_UPLOAD_MB,
  safeParseResult,
  updateSubmissionStatusSchema,
} from "@/lib/validation";
import {
  FILE_KIND_ORDER,
  SubmissionMetadataDisplay,
  SubmissionMetadataForm,
  type ContributorRow,
  type MetadataDisplayInitial,
} from "./submission-workflow-forms";
import { ModeSelector } from "@/components/constructor/ModeSelector";

type FileRow = {
  id: string;
  originalName: string;
  mimeType: string;
  kind?: string;
  /** OJS-style: `review` = visible to reviewers */
  fileStage?: string;
};

type SubmissionDetail = {
  id: string;
  slug: string;
  title: string;
  titleAr?: string | null;
  abstract: string;
  abstractAr?: string | null;
  status: string;
  authorId?: string;
  updatedAt: string;
  reviewMethod?: string;
  articleType?: string | null;
  keywords?: string | null;
  keywordsAr?: string | null;
  contributors?: ContributorRow[] | null;
  fundingStatement?: string | null;
  conflictOfInterestStatement?: string | null;
  ethicalApprovalReference?: string | null;
  originalityConfirmed?: boolean;
  aiUsageStatement?: string | null;
  files?: FileRow[];
  /**
   * When non-null, the submission was authored using the Word Constructor.
   * Affects the manuscript section: the upload UI is hidden and an
   * "Edit in Constructor" CTA replaces it.
   */
  constructorContent?: unknown | null;
};

type Me = { id: string; permissions: string[] };

type ReviewerCandidate = {
  id: string;
  displayName: string;
  email: string;
};

type AssignmentRow = {
  id: string;
  slug?: string | null;
  reviewerId: string;
  status: string;
  reviewer?: { displayName?: string; email?: string };
};

type ReminderAdminRow = {
  id: string;
  kind: string;
  sendAt: string;
  status: string;
};

type ReviewForEditor = {
  id: string;
  commentsForAuthor: string;
  commentsToEditorOnly: string;
  recommendation: string;
  submittedAt: string;
  assignment?: {
    reviewer?: { displayName?: string; email?: string };
  };
};

type ReviewForAuthor = {
  id: string;
  commentsForAuthor: string;
  submittedAt: string;
};

function SubmissionFileRow({
  f,
  showRemove,
  busy,
  onDownload,
  onRemove,
  t,
  tWf,
  softRows,
  editorCanTogglePackage,
  onTogglePackage,
}: {
  f: FileRow;
  showRemove: boolean;
  busy: boolean;
  onDownload: (f: FileRow) => void;
  onRemove?: (fileId: string) => void;
  t: (key: string) => string;
  tWf: (key: string) => string;
  softRows?: boolean;
  editorCanTogglePackage?: boolean;
  onTogglePackage?: (f: FileRow) => void;
}) {
  const tk = tWf as unknown as (k: string) => string;
  const stage = f.fileStage === "review" ? "review" : "submission";
  const rowCls = softRows
    ? "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink/10 bg-paper/60 px-3 py-3"
    : "flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 py-3 last:border-b-0";
  return (
    <li className={rowCls}>
      <span
        className="min-w-0 flex-1 truncate text-start text-sm text-ink"
        title={f.originalName}
      >
        <span className="me-2 rounded bg-ink/8 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ink/70">
          {tk(`fileKind_${f.kind || "manuscript"}`)}
        </span>
        <span className="me-2 rounded bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-accent/90">
          {t(`fileStage_${stage}`)}
        </span>
        {f.originalName}
      </span>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onDownload(f)}
          className="rounded-md border border-ink/15 bg-paper px-3 py-1.5 text-sm font-medium text-ink hover:border-accent/40 disabled:opacity-50"
        >
          {t("download")}
        </button>
        {editorCanTogglePackage && onTogglePackage ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onTogglePackage(f)}
            className="rounded-md border border-accent/30 bg-accent/5 px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/10 disabled:opacity-50"
          >
            {stage === "review"
              ? t("toggleReviewPackageExclude")
              : t("toggleReviewPackageInclude")}
          </button>
        ) : null}
        {showRemove && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onRemove?.(f.id)}
            className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
            title={t("removeFile")}
          >
            × {t("removeFile")}
          </button>
        )}
      </div>
    </li>
  );
}

function recommendationLabel(
  r: string,
  tCommon: (key: string) => string,
): string {
  if (r === "accept") return tCommon("recAccept");
  if (r === "reject") return tCommon("recReject");
  return tCommon("recRevisions");
}

export default function SubmissionDetailPage() {
  const t = useTranslations("SubmissionDetail");
  const tWf = useTranslations("SubmissionWorkflow");
  const tSub = useTranslations("Submissions");
  const tCommon = useTranslations("Common");
  const tUi = useTranslations("UI");
  const tAssign = useTranslations("Assignments");
  const tv = useTranslations("Validation");
  const locale = useLocale();
  const params = useParams();
  const slug = params.slug as string;
  const router = useRouter();
  const fileInputId = useId();
  const reviewMethodSelectId = useId();
  const [me, setMe] = useState<Me | null>(null);
  const [sub, setSub] = useState<SubmissionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewerPick, setReviewerPick] = useState("");
  const [reviewerCandidates, setReviewerCandidates] = useState<
    ReviewerCandidate[]
  >([]);
  const [reviewersLoadError, setReviewersLoadError] = useState<string | null>(
    null,
  );
  const [statusPick, setStatusPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadingName, setUploadingName] = useState<string | null>(null);
  const [editorReviews, setEditorReviews] = useState<ReviewForEditor[]>([]);
  const [authorReviews, setAuthorReviews] = useState<ReviewForAuthor[]>([]);
  const [reviewsError, setReviewsError] = useState<string | null>(null);
  const [editorAssignmentRows, setEditorAssignmentRows] = useState<
    AssignmentRow[]
  >([]);
  const [assignmentReminders, setAssignmentReminders] = useState<
    Record<string, ReminderAdminRow[]>
  >({});
  const [reminderRescheduleAt, setReminderRescheduleAt] = useState<
    Record<string, string>
  >({});

  const load = useCallback(async () => {
    const enc = encodeURIComponent(slug);
    const [m, s] = await Promise.all([
      apiJson<MeProfile>("/auth/me"),
      apiJson<SubmissionDetail>(`/submissions/${enc}`),
    ]);
    const permissions = m.permissions ?? [];
    const isEditorView = permissions.includes(
      PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
    );
    const isOwner = s.authorId === m.id;

    let candidates: ReviewerCandidate[] = [];
    let reviewErr: string | null = null;
    let assignmentRows: AssignmentRow[] = [];
    if (
      isEditorView &&
      permissions.includes(PERMISSION_SLUGS.SUBMISSION_LIST_ASSIGNMENTS)
    ) {
      try {
        assignmentRows = await apiJson<AssignmentRow[]>(
          `/submissions/${enc}/assignments`,
        );
      } catch {
        assignmentRows = [];
      }
    }
    if (
      isEditorView &&
      permissions.includes(PERMISSION_SLUGS.SUBMISSION_ASSIGN_REVIEWER)
    ) {
      try {
        const allCandidates = await apiJson<ReviewerCandidate[]>(
          "/users/reviewer-candidates",
        );
        const busyReviewerIds = new Set(
          assignmentRows
            .filter(
              (a) => a.status === "invited" || a.status === "accepted",
            )
            .map((a) => a.reviewerId),
        );
        candidates = allCandidates.filter((c) => !busyReviewerIds.has(c.id));
      } catch (err) {
        reviewErr =
          err instanceof ApiError ? err.message : t("reviewersLoadFailed");
      }
    }

    setEditorReviews([]);
    setAuthorReviews([]);
    setReviewsError(null);
    if (isEditorView || isOwner) {
      try {
        const revs = await apiJson<
          ReviewForEditor[] | ReviewForAuthor[]
        >(`/submissions/${enc}/reviews`);
        if (isEditorView) {
          setEditorReviews(revs as ReviewForEditor[]);
        } else {
          setAuthorReviews(revs as ReviewForAuthor[]);
        }
      } catch (err) {
        setReviewsError(
          err instanceof ApiError ? err.message : t("reviewsLoadFailed"),
        );
      }
    }

    setMe({
      id: m.id,
      permissions,
    });
    setSub(s);
    setStatusPick(s.status);
    setReviewerCandidates(candidates);
    setReviewersLoadError(reviewErr);
    let reminderMap: Record<string, ReminderAdminRow[]> = {};
    if (
      isEditorView &&
      permissions.includes(PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS) &&
      assignmentRows.length > 0
    ) {
      const entries = await Promise.all(
        assignmentRows
          .filter((a) => a.slug)
          .map(async (a) => {
            const asg = String(a.slug);
            try {
              const rows = await apiJson<ReminderAdminRow[]>(
                `/submissions/${enc}/assignments/${encodeURIComponent(asg)}/reminders`,
              );
              return [asg, rows] as const;
            } catch {
              return [asg, []] as const;
            }
          }),
      );
      reminderMap = Object.fromEntries(entries);
    }
    setEditorAssignmentRows(assignmentRows);
    setAssignmentReminders(reminderMap);
  }, [slug, t]);

  useEffect(() => {
    if (!getStoredToken()) {
      router.replace("/login");
      return;
    }
    load().catch((err) => {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/login");
        return;
      }
      setError(err instanceof ApiError ? err.message : t("loadFailed"));
    });
  }, [load, router, t]);

  async function uploadFile(f: File, kind: string) {
    if (!sub) return;
    setBusy(true);
    setUploadingName(f.name);
    setError(null);
    if (fileExceedsUploadLimit(f)) {
      setError(tv("fileTooLarge", { maxMb: MAX_UPLOAD_MB }));
      setBusy(false);
      setUploadingName(null);
      return;
    }
    try {
      await apiUpload(`/submissions/${encodeURIComponent(sub.slug)}/files`, f, {
        kind,
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("uploadFailed"));
    } finally {
      setBusy(false);
      setUploadingName(null);
    }
  }

  async function downloadSubmissionFile(f: FileRow) {
    const token = getStoredToken();
    if (!token) return;
    setBusy(true);
    try {
      const res = await fetch(
        `${getApiBase()}/api/v1/submissions/${encodeURIComponent(sub!.slug)}/files/${f.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error("fail");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = f.originalName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(t("downloadFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function removeSubmissionFile(fileId: string) {
    if (
      !sub ||
      (sub.status !== "draft" && sub.status !== "revisions_requested")
    )
      return;
    if (!window.confirm(t("removeFileConfirm"))) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson(
        `/submissions/${encodeURIComponent(sub.slug)}/files/${fileId}`,
        {
          method: "DELETE",
        },
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("deleteFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function submitForReview() {
    if (!sub) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/submissions/${encodeURIComponent(sub.slug)}/submit`, {
        method: "POST",
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("submitFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function assignReviewer() {
    if (!sub) return;
    const parsed = safeParseResult(assignReviewerSchema, {
      reviewerId: reviewerPick.trim(),
    });
    if (!parsed.ok) {
      setError(joinValidationBulletList(formatZodIssues(tv, parsed.error.issues)));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiJson(
        `/submissions/${encodeURIComponent(sub.slug)}/assignments`,
        {
          method: "POST",
          body: JSON.stringify(parsed.data),
        },
      );
      setReviewerPick("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("assignFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus() {
    if (!sub) return;
    const parsed = safeParseResult(updateSubmissionStatusSchema, {
      status: statusPick,
    });
    if (!parsed.ok) {
      setError(joinValidationBulletList(formatZodIssues(tv, parsed.error.issues)));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/submissions/${encodeURIComponent(sub.slug)}/status`, {
        method: "PATCH",
        body: JSON.stringify(parsed.data),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("statusFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function patchReminderSendAt(
    assignmentSlug: string,
    reminderId: string,
  ) {
    if (!sub) return;
    const raw = reminderRescheduleAt[reminderId];
    if (!raw) return;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return;
    setBusy(true);
    setError(null);
    try {
      const enc = encodeURIComponent(sub.slug);
      await apiJson(
        `/submissions/${enc}/assignments/${encodeURIComponent(assignmentSlug)}/reminders/${reminderId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ sendAt: d.toISOString() }),
        },
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("reminderLoadFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function cancelReminderRow(
    assignmentSlug: string,
    reminderId: string,
  ) {
    if (!sub) return;
    setBusy(true);
    setError(null);
    try {
      const enc = encodeURIComponent(sub.slug);
      await apiJson(
        `/submissions/${enc}/assignments/${encodeURIComponent(assignmentSlug)}/reminders/${reminderId}/cancel`,
        { method: "POST" },
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("reminderLoadFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function patchReviewMethod(nextMethod: string) {
    if (!sub) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson(
        `/submissions/${encodeURIComponent(sub.slug)}/review-method`,
        {
          method: "PATCH",
          body: JSON.stringify({ reviewMethod: nextMethod }),
        },
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("reviewMethodFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function patchFileReviewStage(f: FileRow) {
    if (!sub) return;
    const next = f.fileStage === "review" ? "submission" : "review";
    setBusy(true);
    setError(null);
    try {
      await apiJson(
        `/submissions/${encodeURIComponent(sub.slug)}/files/${f.id}/stage`,
        {
          method: "PATCH",
          body: JSON.stringify({ fileStage: next }),
        },
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("fileStageFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (error && !sub) {
    return (
      <main className={PAGE_SHELL_NARROW}>
        <p className="text-red-700">{error}</p>
      </main>
    );
  }

  if (!sub || !me) {
    return (
      <main className={PAGE_SHELL_NARROW}>
        <p className="text-ink/60">{t("loading")}</p>
      </main>
    );
  }

  const isAuthor =
    sub.authorId != null && sub.authorId !== "" && sub.authorId === me.id;
  const isEditorView = me.permissions.includes(
    PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
  );
  const canConfigureReview =
    isEditorView &&
    (me.permissions.includes(PERMISSION_SLUGS.SUBMISSION_CHANGE_STATUS) ||
      me.permissions.includes(PERMISSION_SLUGS.SUBMISSION_ASSIGN_REVIEWER));
  const canEditManuscript =
    isAuthor &&
    (sub.status === "draft" || sub.status === "revisions_requested");
  const canRemoveFiles =
    isAuthor &&
    (sub.status === "draft" || sub.status === "revisions_requested");
  const showMetadataForm =
    isAuthor &&
    !isEditorView &&
    (sub.status === "draft" || sub.status === "revisions_requested");
  const showMetadataReadonly = isEditorView || (isAuthor && !showMetadataForm);
  const showAbstractSection = !showMetadataForm;

  const metadataFormInitial = {
    title: sub.title,
    titleAr: sub.titleAr ?? "",
    abstract: sub.abstract,
    abstractAr: sub.abstractAr ?? "",
    articleType: sub.articleType ?? null,
    keywords: sub.keywords ?? null,
    keywordsAr: sub.keywordsAr ?? null,
    contributors: (sub.contributors as ContributorRow[] | null) ?? null,
    fundingStatement: sub.fundingStatement ?? null,
    conflictOfInterestStatement: sub.conflictOfInterestStatement ?? null,
    ethicalApprovalReference: sub.ethicalApprovalReference ?? null,
    originalityConfirmed: sub.originalityConfirmed === true,
    aiUsageStatement: sub.aiUsageStatement ?? null,
  };
  const metadataDisplayInitial: MetadataDisplayInitial = {
    articleType: metadataFormInitial.articleType,
    keywords: metadataFormInitial.keywords,
    keywordsAr: metadataFormInitial.keywordsAr,
    contributors: metadataFormInitial.contributors,
    fundingStatement: metadataFormInitial.fundingStatement,
    conflictOfInterestStatement: metadataFormInitial.conflictOfInterestStatement,
    ethicalApprovalReference: metadataFormInitial.ethicalApprovalReference,
    originalityConfirmed: metadataFormInitial.originalityConfirmed,
    aiUsageStatement: metadataFormInitial.aiUsageStatement,
  };
  const files = sub.files ?? [];
  const showReadonlyFiles = !canEditManuscript && files.length > 0;

  const mainShellCls = isEditorView
    ? submissionQueueShellCls
    : PAGE_SHELL_NARROW;
  const cardRounded = isEditorView ? "rounded-xl" : "rounded-lg";
  const contentPad = isEditorView ? "p-6 sm:p-8" : "p-6";

  const statuses = [
    "draft",
    "submitted",
    "under_review",
    "revisions_requested",
    "accepted",
    "rejected",
    "published",
  ];

  const statusLabel = submissionStatusLabel(sub.status, tSub);
  const tWfAny = tWf as unknown as (k: string) => string;

  return (
    <main className={mainShellCls}>
      {isEditorView ? (
        <header className="border-s-4 border-s-accent/35 ps-5">
          <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <Link href="/submissions" className="text-accent hover:underline">
              {t("back")}
            </Link>
            <span className="text-ink/25" aria-hidden>
              ·
            </span>
            <Link
              href="/editor"
              className="text-ink/70 hover:text-accent hover:underline"
            >
              {t("backToEditorQueue")}
            </Link>
          </nav>
          {error && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              <p className="min-w-0 flex-1 pt-0.5">{error}</p>
              <button
                type="button"
                onClick={() => setError(null)}
                className="shrink-0 rounded p-1 text-lg leading-none text-red-800 hover:bg-red-100"
                aria-label={t("dismissError")}
              >
                ×
              </button>
            </div>
          )}
          <div className="mt-6 flex flex-wrap items-start gap-3 gap-y-2">
            <div className="min-w-0 flex-1">
              <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                {sub.title}
              </h1>
              {sub.titleAr?.trim() ? (
                <p
                  dir="rtl"
                  className="mt-2 font-serif text-2xl font-semibold leading-snug text-ink/90"
                >
                  {sub.titleAr}
                </p>
              ) : null}
            </div>
            <span className={statusPillClass(sub.status)}>{statusLabel}</span>
          </div>
          <p className="sr-only">{t("status", { status: statusLabel })}</p>
        </header>
      ) : (
        <>
          <Link
            href="/submissions"
            className="text-sm text-accent hover:underline"
          >
            {t("back")}
          </Link>
          {error && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              <p className="min-w-0 flex-1 pt-0.5">{error}</p>
              <button
                type="button"
                onClick={() => setError(null)}
                className="shrink-0 rounded p-1 text-lg leading-none text-red-800 hover:bg-red-100"
                aria-label={t("dismissError")}
              >
                ×
              </button>
            </div>
          )}
          <h1 className="mt-4 font-serif text-3xl font-semibold text-ink">
            {sub.title}
          </h1>
          {sub.titleAr?.trim() ? (
            <p
              dir="rtl"
              className="mt-2 font-serif text-2xl font-semibold leading-snug text-ink/90"
            >
              {sub.titleAr}
            </p>
          ) : null}
          <p className="mt-2 text-sm text-ink/70">
            {t("status", { status: statusLabel })}
          </p>
          {sub.reviewMethod === "double_anonymous" ? (
            <p className="mt-4 rounded-lg border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
              {t("doubleBlindAuthorNotice")}
            </p>
          ) : null}
        </>
      )}
      {showMetadataReadonly && (
        <section
          className={`mt-6 ${cardRounded} border border-ink/10 bg-surface shadow-sm ${contentPad}`}
        >
          <h2 className="font-serif text-lg font-semibold text-ink">
            {tWf("metadataReadonlyTitle")}
          </h2>
          <p className="mt-1 text-sm text-ink/65">{tWf("metadataReadonlyHint")}</p>
          <div className="mt-4">
            <SubmissionMetadataDisplay
              key={sub.updatedAt}
              initial={metadataDisplayInitial}
            />
          </div>
        </section>
      )}

      {showMetadataForm && (
        <section
          className={`mt-6 ${cardRounded} border border-ink/10 bg-surface shadow-sm ${contentPad}`}
        >
          <h2 className="font-serif text-lg font-semibold text-ink">
            {tWf("metadataEditTitle")}
          </h2>
          <p className="mt-1 text-sm text-ink/65">{tWf("metadataEditHint")}</p>
          <div className="mt-6">
            <SubmissionMetadataForm
              key={sub.updatedAt}
              slug={sub.slug}
              canEdit
              initial={metadataFormInitial}
              onSaved={() => void load()}
              onError={(msg) => setError(msg)}
            />
          </div>
        </section>
      )}

      {showAbstractSection && (
        <section
          className={`mt-6 ${cardRounded} border border-ink/10 bg-surface shadow-sm ${contentPad}`}
        >
          <h2 className="font-medium text-ink">{t("abstractsSection")}</h2>
          <div className="mt-4 space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-ink">
                {tWf("abstractLabelEn")}
              </h3>
              <p
                dir="ltr"
                className="mt-2 whitespace-pre-wrap text-sm text-ink/80"
              >
                {sub.abstract}
              </p>
            </div>
            {sub.abstractAr?.trim() ? (
              <div>
                <h3 className="text-sm font-semibold text-ink">
                  {tWf("abstractLabelAr")}
                </h3>
                <p
                  dir="rtl"
                  className="mt-2 whitespace-pre-wrap text-sm text-ink/80"
                >
                  {sub.abstractAr}
                </p>
              </div>
            ) : null}
          </div>
        </section>
      )}

      {canEditManuscript && sub.constructorContent != null && (
        <section
          className={`mt-8 ${cardRounded} border border-ink/10 bg-surface shadow-sm ${contentPad}`}
        >
          <h2 className="font-serif text-lg font-semibold text-ink">
            {t("manuscript")}
          </h2>
          <p className="mt-1 text-sm text-ink/70">
            {t("constructorModeNotice")}
          </p>
          <div className="mt-4">
            <Link
              href={`/submissions/${encodeURIComponent(sub.slug)}/constructor`}
              className="inline-flex items-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent/90"
            >
              {t("openConstructor")}
            </Link>
          </div>
        </section>
      )}

      {canEditManuscript &&
        sub.constructorContent == null &&
        files.length === 0 && (
          <section
            className={`mt-8 ${cardRounded} border border-ink/10 bg-surface shadow-sm ${contentPad}`}
          >
            <h2 className="font-serif text-lg font-semibold text-ink">
              {t("chooseManuscriptMode")}
            </h2>
            <p className="mt-1 text-sm text-ink/70">
              {t("chooseManuscriptModeHint")}
            </p>
            <div className="mt-4">
              <ModeSelector slug={sub.slug} inline />
            </div>
          </section>
        )}

      {canEditManuscript && sub.constructorContent == null && (
        <section
          className={`mt-8 space-y-6 ${cardRounded} border border-ink/10 bg-surface shadow-sm ${contentPad}`}
        >
          <div>
            <h2 className="font-serif text-lg font-semibold text-ink">
              {t("manuscript")}
            </h2>
            <p className="mt-1 text-sm text-ink/70">{t("uploadSubtitle")}</p>
          </div>
          <div className="space-y-5">
            {FILE_KIND_ORDER.map(({ kind, required }) => (
              <div
                key={kind}
                className="rounded-lg border border-ink/10 bg-paper/40 px-4 py-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-ink">
                    {tWfAny(`fileKind_${kind}`)}
                    {required ? (
                      <span className="ms-1 text-xs font-normal text-red-700">
                        {tWf("requiredBadge")}
                      </span>
                    ) : (
                      <span className="ms-1 text-xs font-normal text-ink/50">
                        {tWf("optionalBadge")}
                      </span>
                    )}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink/55">{tWfAny(`fileKindHint_${kind}`)}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <input
                    id={`${fileInputId}-${kind}`}
                    type="file"
                    className="sr-only"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadFile(file, kind);
                      e.target.value = "";
                    }}
                  />
                  <label
                    htmlFor={`${fileInputId}-${kind}`}
                    className={`inline-flex cursor-pointer rounded-md border border-ink/20 bg-paper px-4 py-2 text-sm font-medium text-ink shadow-sm hover:border-accent/40 ${busy ? "pointer-events-none opacity-50" : ""}`}
                  >
                    {t("chooseFile")}
                  </label>
                </div>
              </div>
            ))}
          </div>
          {uploadingName && (
            <p className="text-sm text-ink/70">
              {t("uploading")}{" "}
              <span className="font-medium text-ink">{uploadingName}</span>
            </p>
          )}
          <p className="text-xs text-ink/60">{t("uploadHint")}</p>
          {files.length > 0 && (
            <div className="pt-2">
              <h3 className="text-sm font-medium text-ink">{t("yourFiles")}</h3>
              <ul className="mt-1">
                {files.map((f) => (
                  <SubmissionFileRow
                    key={f.id}
                    f={f}
                    showRemove={canRemoveFiles}
                    busy={busy}
                    t={t}
                    tWf={tWf}
                    editorCanTogglePackage={canConfigureReview}
                    onTogglePackage={(row) => void patchFileReviewStage(row)}
                    onDownload={(row) => void downloadSubmissionFile(row)}
                    onRemove={(fileId) => void removeSubmissionFile(fileId)}
                  />
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {showReadonlyFiles && (
        <section
          className={`mt-8 ${cardRounded} border border-ink/10 bg-surface shadow-sm ${contentPad}`}
        >
          <h2 className="font-serif text-lg font-semibold text-ink">
            {t("attachedFiles")}
          </h2>
          <ul
            className={
              isEditorView ? "mt-3 space-y-2" : "mt-2"
            }
          >
            {files.map((f) => (
              <SubmissionFileRow
                key={f.id}
                f={f}
                showRemove={false}
                busy={busy}
                t={t}
                tWf={tWf}
                softRows={isEditorView}
                editorCanTogglePackage={canConfigureReview}
                onTogglePackage={(row) => void patchFileReviewStage(row)}
                onDownload={(row) => void downloadSubmissionFile(row)}
              />
            ))}
          </ul>
        </section>
      )}

      {isEditorView && (
        <section
          className={`mt-8 ${cardRounded} border border-ink/10 bg-surface shadow-sm ${contentPad}`}
        >
          <h2 className="font-serif text-lg font-semibold text-ink">
            {t("reviewsSectionEditor")}
          </h2>
          {reviewsError && (
            <p className="mt-3 text-sm text-red-700">{reviewsError}</p>
          )}
          {!reviewsError && editorReviews.length === 0 && (
            <p className="mt-3 text-sm text-ink/65">{t("reviewsEmpty")}</p>
          )}
          {!reviewsError && editorReviews.length > 0 && (
            <ul className="mt-4 space-y-6">
              {editorReviews.map((r) => {
                const name =
                  r.assignment?.reviewer?.displayName?.trim() ||
                  r.assignment?.reviewer?.email?.trim();
                const reviewerLine = name
                  ? t("reviewFrom", { name })
                  : t("reviewReviewerUnknown");
                const submitted = new Date(r.submittedAt).toLocaleString(
                  locale,
                  {
                    dateStyle: "medium",
                    timeStyle: "short",
                  },
                );
                return (
                  <li
                    key={r.id}
                    className="rounded-lg border border-ink/10 bg-paper/50 p-4 sm:p-5"
                  >
                    <p className="text-xs font-medium uppercase tracking-wide text-ink/50">
                      {reviewerLine}
                    </p>
                    <p className="mt-1 text-xs text-ink/55">
                      {t("reviewSubmitted")}: {submitted}
                    </p>
                    <p className="mt-4 text-sm font-semibold text-ink">
                      {t("reviewRecommendation")}:{" "}
                      {recommendationLabel(r.recommendation, tCommon)}
                    </p>
                    <div className="mt-4">
                      <h3 className="text-sm font-semibold text-ink">
                        {t("reviewForAuthor")}
                      </h3>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/85">
                        {r.commentsForAuthor}
                      </p>
                    </div>
                    <div className="mt-4 border-t border-ink/10 pt-4">
                      <h3 className="text-sm font-semibold text-ink">
                        {t("reviewForEditorOnly")}
                      </h3>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/85">
                        {r.commentsToEditorOnly?.trim()
                          ? r.commentsToEditorOnly
                          : t("reviewNoEditorComments")}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {isAuthor && !isEditorView && (
        <section
          className={`mt-8 ${cardRounded} border border-ink/10 bg-surface shadow-sm ${contentPad}`}
        >
          <h2 className="font-serif text-lg font-semibold text-ink">
            {t("reviewsSectionAuthor")}
          </h2>
          {reviewsError && (
            <p className="mt-3 text-sm text-red-700">{reviewsError}</p>
          )}
          {!reviewsError && authorReviews.length === 0 && (
            <p className="mt-3 text-sm text-ink/65">{t("reviewsEmpty")}</p>
          )}
          {!reviewsError && authorReviews.length > 0 && (
            <ul className="mt-4 space-y-5">
              {authorReviews.map((r, idx) => {
                const submitted = new Date(r.submittedAt).toLocaleString(
                  locale,
                  {
                    dateStyle: "medium",
                    timeStyle: "short",
                  },
                );
                return (
                  <li
                    key={r.id}
                    className="rounded-lg border border-ink/10 bg-paper/50 p-4 sm:p-5"
                  >
                    <p className="text-sm font-semibold text-ink">
                      {t("reviewFeedbackItem", { n: idx + 1 })}
                    </p>
                    <p className="mt-1 text-xs text-ink/55">
                      {t("reviewSubmitted")}: {submitted}
                    </p>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink/85">
                      {r.commentsForAuthor}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {canEditManuscript && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void submitForReview()}
          className="mt-6 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {t("submitForReview")}
        </button>
      )}

      {isEditorView && (
        <section className="mt-6 rounded-xl border border-ink/10 bg-surface p-5 shadow-sm sm:p-6">
          <h2 className="font-serif text-lg font-semibold text-ink">
            {t("editorPanelTitle")}
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/70">
            {t("editorPanelHint")}
          </p>
          {canConfigureReview ? (
            <div className="mt-6 rounded-lg border border-ink/10 bg-paper/40 px-4 py-4">
              <div className="flex flex-col gap-1 text-sm font-medium text-ink">
                <span id={reviewMethodSelectId}>{t("reviewMethodLabel")}</span>
                <SimpleSelect
                  value={sub.reviewMethod ?? "double_anonymous"}
                  onValueChange={(v) => void patchReviewMethod(v)}
                  options={[
                    { value: "open", label: t("reviewMethod_open") },
                    {
                      value: "anonymous",
                      label: t("reviewMethod_anonymous"),
                    },
                    {
                      value: "double_anonymous",
                      label: t("reviewMethod_double_anonymous"),
                    },
                  ]}
                  disabled={busy}
                  className="max-w-md"
                  aria-labelledby={reviewMethodSelectId}
                />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-ink/60">
                {t("reviewMethodHint")}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-amber-900/85">
                {t("reviewPackageEditorHint")}
              </p>
            </div>
          ) : null}
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-3">
              <p className="text-sm text-ink/65">
                {t("editorAssignColumnHint")}
              </p>
              {reviewersLoadError && (
                <p className="text-sm text-red-700">{reviewersLoadError}</p>
              )}
              <div className="flex flex-col gap-1 text-sm font-medium text-ink">
                <span id="reviewer-select-label">{t("reviewerLabel")}</span>
                <SearchableSelect
                  options={reviewerCandidates.map((c) => ({
                    value: c.id,
                    label: `${c.displayName} (${c.email})`,
                    keywords: [c.displayName, c.email],
                  }))}
                  value={reviewerPick}
                  onValueChange={setReviewerPick}
                  placeholder={t("reviewerPlaceholder")}
                  searchPlaceholder={tUi("searchPlaceholder")}
                  emptyText={tUi("noResults")}
                  disabled={
                    busy ||
                    !!reviewersLoadError ||
                    !me.permissions.includes(
                      PERMISSION_SLUGS.SUBMISSION_ASSIGN_REVIEWER,
                    )
                  }
                  className="w-full"
                  aria-labelledby="reviewer-select-label"
                />
              </div>
              <button
                type="button"
                disabled={busy || !reviewerPick.trim() || !!reviewersLoadError}
                onClick={() => void assignReviewer()}
                className="w-fit rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-accent/90 disabled:opacity-50"
              >
                {t("assignReviewer")}
              </button>
              {!reviewersLoadError &&
                me.permissions.includes(
                  PERMISSION_SLUGS.SUBMISSION_ASSIGN_REVIEWER,
                ) &&
                reviewerCandidates.length === 0 && (
                  <p className="text-sm text-ink/70">
                    {t("noReviewersAvailable")}
                  </p>
                )}
            </div>
            <div className="flex flex-col gap-3">
              <p className="text-sm text-ink/65">
                {t("editorWorkflowColumnHint")}
              </p>
              <div className="flex flex-col gap-1 text-sm font-medium text-ink">
                <span id="status-select-label">{t("setStatus")}</span>
                <SimpleSelect
                  value={statusPick}
                  onValueChange={setStatusPick}
                  options={statuses.map((s) => ({
                    value: s,
                    label: submissionStatusLabel(s, tSub),
                  }))}
                  className="w-full"
                  aria-labelledby="status-select-label"
                />
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void updateStatus()}
                className="w-fit rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-paper shadow-sm hover:bg-ink/90 disabled:opacity-50"
              >
                {t("applyStatus")}
              </button>
            </div>
          </div>
          {editorAssignmentRows.length > 0 && (
            <div className="mt-6 border-t border-ink/10 pt-6">
              <h3 className="font-sans text-sm font-semibold text-ink">
                {t("editorAssignmentsTitle")}
              </h3>
              <ul className="mt-4 space-y-2">
                {editorAssignmentRows.map((a) => {
                  const name =
                    a.reviewer?.displayName?.trim() ||
                    a.reviewer?.email?.trim() ||
                    a.reviewerId;
                  const asg = a.slug ? String(a.slug) : "";
                  const remList = asg
                    ? (assignmentReminders[asg] ?? [])
                    : [];
                  return (
                    <li
                      key={a.id}
                      className="flex flex-col gap-3 rounded-lg border border-ink/10 bg-paper/40 px-4 py-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-ink">{name}</span>
                        <span
                          className={assignmentStatusPillClass(a.status)}
                        >
                          {assignmentStatusLabel(a.status, tAssign)}
                        </span>
                      </div>
                      {me.permissions.includes(
                        PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS,
                      ) && (
                        <div className="border-t border-ink/10 pt-3 text-xs text-ink/80">
                          <p className="font-sans text-[0.8rem] font-semibold text-ink">
                            {t("emailRemindersTitle")}
                          </p>
                          <p className="mt-1 text-ink/65">
                            {t("emailRemindersHint")}
                          </p>
                          {!a.slug ? (
                            <p className="mt-2 text-amber-800">
                              {t("reminderNoSlug")}
                            </p>
                          ) : remList.length === 0 ? (
                            <p className="mt-2 text-ink/60">
                              {t("reminderNoneForAssignment")}
                            </p>
                          ) : (
                            <div className="mt-2 overflow-x-auto">
                              <table className="w-full min-w-[20rem] border-collapse text-left text-[0.75rem]">
                                <thead>
                                  <tr className="border-b border-ink/10 text-ink/70">
                                    <th className="py-1 pe-2 font-medium">
                                      {t("reminderKind")}
                                    </th>
                                    <th className="py-1 pe-2 font-medium">
                                      {t("reminderSendAt")}
                                    </th>
                                    <th className="py-1 pe-2 font-medium">
                                      {t("reminderStatus")}
                                    </th>
                                    <th className="py-1 font-medium">
                                      {t("reminderActions")}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {remList.map((r) => (
                                    <tr
                                      key={r.id}
                                      className="border-b border-ink/5 align-top"
                                    >
                                      <td className="py-2 pe-2">
                                        {r.kind === "review_overdue"
                                          ? t("reminderKindOverdue")
                                          : t("reminderKindDueSoon")}
                                      </td>
                                      <td className="py-2 pe-2 font-mono">
                                        {new Date(r.sendAt).toLocaleString(
                                          locale,
                                          { timeZoneName: "short" },
                                        )}
                                      </td>
                                      <td className="py-2 pe-2">{r.status}</td>
                                      <td className="py-2">
                                        {r.status === "pending" ? (
                                          <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center">
                                            <input
                                              type="datetime-local"
                                              step={60}
                                              className="max-w-[11rem] rounded border border-ink/15 bg-paper px-2 py-1 text-ink"
                                              value={
                                                reminderRescheduleAt[r.id] ?? ""
                                              }
                                              onChange={(e) =>
                                                setReminderRescheduleAt(
                                                  (prev) => ({
                                                    ...prev,
                                                    [r.id]: e.target.value,
                                                  }),
                                                )
                                              }
                                              placeholder={t(
                                                "reminderReschedulePlaceholder",
                                              )}
                                            />
                                            <button
                                              type="button"
                                              disabled={busy}
                                              className="rounded bg-ink/80 px-2 py-1 text-paper hover:bg-ink disabled:opacity-50"
                                              onClick={() =>
                                                void patchReminderSendAt(
                                                  asg,
                                                  r.id,
                                                )
                                              }
                                            >
                                              {t("reminderApplyReschedule")}
                                            </button>
                                            <button
                                              type="button"
                                              disabled={busy}
                                              className="rounded border border-red-200 px-2 py-1 text-red-800 hover:bg-red-50 disabled:opacity-50"
                                              onClick={() =>
                                                void cancelReminderRow(
                                                  asg,
                                                  r.id,
                                                )
                                              }
                                            >
                                              {t("reminderCancel")}
                                            </button>
                                          </div>
                                        ) : (
                                          "—"
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
