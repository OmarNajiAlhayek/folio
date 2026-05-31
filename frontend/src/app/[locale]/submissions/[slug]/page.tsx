"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useId } from "react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import {
  apiBlob,
  apiJson,
  apiUpload,
  ApiError,
} from "@/lib/api";
import {
  ACCEPT_FIGURE,
  ACCEPT_MANUSCRIPT,
  ACCEPT_SUPPLEMENTARY,
} from "@/lib/upload-accept";
import { ApiErrorState } from "@/components/api-error-state";
import { LoadingCenter, Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { getApiErrorKind } from "@/lib/api-error-message";
import { useApiErrorMessages } from "@/lib/use-api-error-messages";
import { useDisciplineLabel } from "@/lib/use-discipline-label";
import { useToastApiError } from "@/lib/use-toast-api-error";
import {
  canManageAssignmentReminders,
  canManageOwnSubmissions,
  PERMISSION_SLUGS,
} from "@/lib/permissions";
import {
  minReminderRescheduleDatetimeLocal,
  reminderRescheduleInputValue,
} from "@/lib/reminder-datetime-local";
import {
  useSubmissionDetail,
  type SubmissionDetailPayload,
} from "@/lib/queries/submissions";
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
  fileKindsForSubmissionDetail,
  SubmissionMetadataDisplay,
  SubmissionMetadataForm,
  type ContributorRow,
  type MetadataDisplayInitial,
} from "./submission-workflow-forms";
import { ConstructorManuscriptRow } from "@/components/constructor/ConstructorManuscriptRow";
import { ReviewManuscriptPresentationPicker } from "@/components/constructor/ReviewManuscriptPresentationPicker";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { constructorDraftHasMeaningfulContent } from "@/lib/constructor-import-merge";
import { resolveConstructorDocxFileName } from "@/lib/constructor-docx-filename";
import {
  type ReviewManuscriptPresentation,
  detectManuscriptSources,
  readReviewManuscriptPresentation,
  resolveDefaultReviewManuscriptPresentation,
  presentationIsValid,
  writeReviewManuscriptPresentation,
} from "@/lib/review-manuscript-presentation";
import {
  useInvalidateSubmissionDetail,
  usePatchSubmission,
} from "@/lib/queries/submissions";
import { CopyeditSection } from "@/components/copyedit/CopyeditSection";
import { SubmissionDisciplinePanel } from "@/components/submission-discipline-panel";
import { CorpusSimilarityPanel } from "@/components/corpus-similarity-panel";
import { ReviewerSuggestionsPanel } from "@/components/reviewer-suggestions-panel";
import type {
  ConstructorContent,
  ConstructorValidationError,
} from "@/lib/constructor-content.types";
import { submitSubmissionForReview } from "@/lib/constructor-manuscript";
import { stashConstructorSubmitErrors } from "@/lib/constructor-submit-errors";
import { editorStatusOptions } from "@/lib/editor-status-transitions";
import { submissionAllowsReviewConfiguration } from "@/lib/submission-review-phase";

type FileRow = {
  id: string;
  originalName: string;
  mimeType: string;
  kind?: string;
  /** OJS-style: `review` = visible to reviewers */
  fileStage?: string;
  isPublic?: boolean;
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
  reviewManuscriptPresentation?: {
    presentUploaded: boolean;
    presentConstructor: boolean;
  } | null;
  discipline?: string | null;
  disciplineSource?: string | null;
  disciplineSuggested?: string | null;
  disciplineSuggestedConfidence?: number | null;
  disciplineScopeInJournal?: boolean | null;
  disciplineScopeWarning?: string | null;
};

type ReviewerCandidate = SubmissionDetailPayload["reviewerCandidates"][number];

type AssignmentRow = SubmissionDetailPayload["editorAssignmentRows"][number];

type ReminderAdminRow =
  SubmissionDetailPayload["assignmentReminders"][string][number];

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

function getFileIcon(kind: string) {
  if (kind === "table") {
    return (
      <svg className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    );
  }
  if (kind === "figure") {
    return (
      <svg className="size-5 shrink-0 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375 0 11-.75 0 .375 0 01.75 0z" />
      </svg>
    );
  }
  if (kind === "supplementary") {
    return (
      <svg className="size-5 shrink-0 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
      </svg>
    );
  }
  return (
    <svg className="size-5 shrink-0 text-accent/80 dark:text-accent/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function SubmissionFileRow({
  f,
  showRemove,
  busy,
  onDownload,
  onRemove,
  t,
  tWf,
  softRows,
  showWorkflowStageBadge,
  showPublicBadge,
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
  showWorkflowStageBadge?: boolean;
  showPublicBadge?: boolean;
  editorCanTogglePackage?: boolean;
  onTogglePackage?: (f: FileRow) => void;
}) {
  const tk = tWf as unknown as (k: string) => string;
  const stage = f.fileStage === "review" ? "review" : "submission";
  const rowCls = softRows
    ? "group flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/10 bg-paper/60 p-4 shadow-2xs hover:border-accent-2/20 hover:bg-paper/80 transition-all duration-200"
    : "group flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 py-4 last:border-b-0 hover:bg-ink/[0.01] px-2 rounded-lg transition-colors";
  return (
    <li className={rowCls}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-xl bg-ink/5 dark:bg-white/5 transition-colors group-hover:bg-accent/5 dark:group-hover:bg-accent/10">
          {getFileIcon(f.kind || "manuscript")}
        </div>
        <div className="min-w-0 flex-1 text-start">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-ink/8 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-ink/70 font-semibold">
              {tk(`fileKind_${f.kind || "manuscript"}`)}
            </span>
            {showWorkflowStageBadge ? (
              <span className="rounded bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-accent font-semibold">
                {t(`fileStage_${stage}`)}
              </span>
            ) : null}
            {showPublicBadge && f.isPublic ? (
              <span className="rounded bg-emerald-100 dark:bg-emerald-950/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-emerald-900/90 dark:text-emerald-300 font-semibold">
                {t("filePublicBadge")}
              </span>
            ) : null}
          </div>
          <p 
            className="mt-1 truncate text-sm font-medium text-ink transition-colors group-hover:text-accent"
            title={f.originalName}
          >
            {f.originalName}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onDownload(f)}
          className="inline-flex items-center justify-center rounded-xl border border-ink/15 dark:border-white/15 bg-paper px-3 py-1.5 text-xs font-semibold text-ink shadow-2xs hover:border-accent/40 active:scale-[0.98] transition-all duration-150 disabled:opacity-50"
        >
          {t("download")}
        </button>
        {editorCanTogglePackage && onTogglePackage ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onTogglePackage(f)}
            className="inline-flex items-center justify-center rounded-xl border border-accent/20 bg-accent/[0.04] px-3 py-1.5 text-xs font-semibold text-accent shadow-2xs hover:bg-accent/[0.08] active:scale-[0.98] transition-all duration-150 disabled:opacity-50"
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
            className="inline-flex items-center justify-center rounded-xl border border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-950/20 px-3 py-1.5 text-xs font-semibold text-red-800 dark:text-red-400 shadow-2xs hover:bg-red-100 dark:hover:bg-red-950/40 active:scale-[0.98] transition-all duration-150 disabled:opacity-50"
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

function parseInvalidStatusTransition(
  err: ApiError,
): { from: string; to: string } | null {
  if (err.code === "INVALID_STATUS_TRANSITION") {
    const from = String(err.details?.fromStatus ?? "");
    const to = String(err.details?.toStatus ?? "");
    if (from && to) return { from, to };
  }
  const match = err.message.match(/^Cannot transition from (\S+) to (\S+)$/);
  if (match) return { from: match[1], to: match[2] };
  return null;
}

const REMINDER_MIN_LEAD_MS = 120_000;

export default function SubmissionDetailPage() {
  const t = useTranslations("SubmissionDetail");
  const tManuscript = useTranslations("ConstructorManuscript");
  const tWf = useTranslations("SubmissionWorkflow");
  const tSub = useTranslations("Submissions");
  const tCommon = useTranslations("Common");
  const tUi = useTranslations("UI");
  const tAssign = useTranslations("Assignments");
  const tv = useTranslations("Validation");
  const locale = useLocale();
  const isAr = locale === "ar";
  const params = useParams();
  const slug = params.slug as string;
  const pathname = usePathname();
  const router = useRouter();
  const fileInputId = useId();
  const reviewMethodSelectId = useId();
  const invalidateDetail = useInvalidateSubmissionDetail();
  const patchSubmission = usePatchSubmission(slug);
  const { resolve: resolveApiError } = useApiErrorMessages();
  const { format: formatDiscipline } = useDisciplineLabel();
  const tApi = useTranslations("ApiErrors");
  const showApiError = useToastApiError();
  const detailQuery = useSubmissionDetail(slug, true);
  const detail = detailQuery.data;
  const me = detail?.me ?? null;
  const sub = detail
    ? (detail.sub as unknown as SubmissionDetail)
    : null;
  const reviewerCandidates = detail?.reviewerCandidates ?? [];
  const reviewersLoadError = detail
    ? detail.reviewersLoadError === "reviewers_load_failed"
      ? t("reviewersLoadFailed")
      : detail.reviewersLoadError
    : null;
  const editorReviews = (detail?.editorReviews ?? []) as ReviewForEditor[];
  const authorReviews = (detail?.authorReviews ?? []) as ReviewForAuthor[];
  const reviewsError = detail?.reviewsLoadFailed ? t("reviewsLoadFailed") : null;
  const editorAssignmentRows = detail?.editorAssignmentRows ?? [];
  const assignmentReminders = detail?.assignmentReminders ?? {};
  const reminderLoadFailedByAssignment =
    detail?.reminderLoadFailedByAssignment ?? {};
  const canManageReminders = me
    ? canManageAssignmentReminders(me.permissions)
    : false;
  const loadError = detailQuery.isError
    ? resolveApiError(detailQuery.error, t("loadFailed"))
    : null;
  const [validationError, setValidationError] = useState<string | null>(null);
  const [reviewerPick, setReviewerPick] = useState("");
  const [statusPick, setStatusPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadingName, setUploadingName] = useState<string | null>(null);
  const [reminderRescheduleAt, setReminderRescheduleAt] = useState<
    Record<string, string>
  >({});
  const [pendingRemoveFileId, setPendingRemoveFileId] = useState<string | null>(
    null,
  );
  const [clearConstructorOpen, setClearConstructorOpen] = useState(false);
  const [reviewPresentation, setReviewPresentation] =
    useState<ReviewManuscriptPresentation>({
      presentUploaded: true,
      presentConstructor: false,
    });

  const serverStatus = sub?.status ?? "";
  useEffect(() => {
    if (serverStatus) setStatusPick(String(serverStatus));
  }, [serverStatus]);

  const toastedReviewersRef = useRef(false);
  useEffect(() => {
    if (!reviewersLoadError) {
      toastedReviewersRef.current = false;
      return;
    }
    if (toastedReviewersRef.current) return;
    toastedReviewersRef.current = true;
    toast.error(reviewersLoadError, { id: "submission-reviewers-load" });
  }, [reviewersLoadError]);

  const toastedReviewsRef = useRef(false);
  useEffect(() => {
    if (!reviewsError) {
      toastedReviewsRef.current = false;
      return;
    }
    if (toastedReviewsRef.current) return;
    toastedReviewsRef.current = true;
    toast.error(reviewsError, { id: "submission-reviews-load" });
  }, [reviewsError]);

  useEffect(() => {
    if (!sub) return;
    const sources = detectManuscriptSources({
      files: sub.files,
      constructorContent: sub.constructorContent,
    });
    const stored = readReviewManuscriptPresentation(sub.slug);
    const fromServer = sub.reviewManuscriptPresentation as
      | ReviewManuscriptPresentation
      | null
      | undefined;
    const next =
      (fromServer &&
      presentationIsValid(fromServer, sources)
        ? fromServer
        : null) ??
      stored ??
      resolveDefaultReviewManuscriptPresentation(sources);
    setReviewPresentation(next);
  }, [sub?.slug, sub?.updatedAt, sub?.constructorContent, sub?.files, sub?.reviewManuscriptPresentation]);

  async function uploadFile(f: File, kind: string) {
    if (!sub) return;
    setBusy(true);
    setUploadingName(f.name);
    setValidationError(null);
    if (fileExceedsUploadLimit(f)) {
      toast.error(tv("fileTooLarge", { maxMb: MAX_UPLOAD_MB }), {
        id: "submission-file-too-large",
      });
      setBusy(false);
      setUploadingName(null);
      return;
    }
    try {
      await apiUpload(`/submissions/${encodeURIComponent(sub.slug)}/files`, f, {
        kind,
      });
      toast.success(t("uploadSuccess"), { id: "submission-upload-success" });
      invalidateDetail(slug);
    } catch (err) {
      showApiError(err, t("uploadFailed"), { id: "submission-upload" });
    } finally {
      setBusy(false);
      setUploadingName(null);
    }
  }

  async function downloadSubmissionFile(f: FileRow) {
    if (!sub) return;
    setBusy(true);
    try {
      const blob = await apiBlob(
        `/submissions/${encodeURIComponent(sub.slug)}/files/${f.id}`,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = f.originalName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("downloadFailed"), { id: "submission-download" });
    } finally {
      setBusy(false);
    }
  }

  function requestRemoveSubmissionFile(fileId: string) {
    if (
      !sub ||
      (sub.status !== "draft" && sub.status !== "revisions_requested")
    )
      return;
    setPendingRemoveFileId(fileId);
  }

  async function confirmRemoveSubmissionFile() {
    const fileId = pendingRemoveFileId;
    if (!fileId || !sub) return;
    setPendingRemoveFileId(null);
    setBusy(true);
    setValidationError(null);
    try {
      await apiJson(
        `/submissions/${encodeURIComponent(sub.slug)}/files/${fileId}`,
        {
          method: "DELETE",
        },
      );
      toast.success(t("fileRemovedSuccess"), { id: "submission-delete-file-success" });
      invalidateDetail(slug);
    } catch (err) {
      showApiError(err, t("deleteFailed"), { id: "submission-delete-file" });
    } finally {
      setBusy(false);
    }
  }

  async function confirmClearConstructorDraft() {
    if (!sub) return;
    setClearConstructorOpen(false);
    setBusy(true);
    setValidationError(null);
    try {
      await patchSubmission.mutateAsync({ constructorContent: null });
      toast.success(t("constructorCleared"), {
        id: "submission-constructor-clear-success",
      });
      invalidateDetail(slug);
    } catch (err) {
      showApiError(err, t("deleteFailed"), { id: "submission-constructor-clear" });
    } finally {
      setBusy(false);
    }
  }

  async function submitForReview() {
    if (!sub) return;
    setBusy(true);
    setValidationError(null);
    try {
      const enc = encodeURIComponent(sub.slug);
      const fresh = await apiJson<SubmissionDetail>(`/submissions/${enc}`);
      const cc = fresh.constructorContent as ConstructorContent | null | undefined;
      const sources = detectManuscriptSources({
        files: fresh.files,
        constructorContent: cc,
      });
      if (!presentationIsValid(reviewPresentation, sources)) {
        toast.error(tManuscript("presentationAtLeastOne"), {
          id: "submission-presentation-required",
        });
        return;
      }

      await submitSubmissionForReview(sub.slug, {
        presentUploadedManuscript: reviewPresentation.presentUploaded,
        presentConstructorManuscript: reviewPresentation.presentConstructor,
        constructorContent:
          reviewPresentation.presentConstructor && sources.hasConstructorDraft
            ? cc
            : null,
      });
      toast.success(t("submitSuccess"), { id: "submission-submit-success" });
      invalidateDetail(slug);
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.code === "CONSTRUCTOR_VALIDATION_FAILED" &&
        Array.isArray(err.details?.errors)
      ) {
        stashConstructorSubmitErrors(
          err.details.errors as ConstructorValidationError[],
        );
        router.push(`/submissions/${encodeURIComponent(sub.slug)}/compose`);
        return;
      }
      showApiError(err, t("submitFailed"), { id: "submission-submit" });
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
      setValidationError(
        joinValidationBulletList(formatZodIssues(tv, parsed.error.issues)),
      );
      return;
    }
    setBusy(true);
    setValidationError(null);
    try {
      await apiJson(
        `/submissions/${encodeURIComponent(sub.slug)}/assignments`,
        {
          method: "POST",
          headers: { "X-Folio-Locale": locale },
          body: JSON.stringify(parsed.data),
        },
      );
      toast.success(t("assignSuccess"), { id: "submission-assign-success" });
      setReviewerPick("");
      invalidateDetail(slug);
    } catch (err) {
      showApiError(err, t("assignFailed"), { id: "submission-assign" });
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
      setValidationError(
        joinValidationBulletList(formatZodIssues(tv, parsed.error.issues)),
      );
      return;
    }
    setBusy(true);
    setValidationError(null);
    try {
      await apiJson(`/submissions/${encodeURIComponent(sub.slug)}/status`, {
        method: "PATCH",
        body: JSON.stringify(parsed.data),
      });
      toast.success(t("statusUpdated"));
      invalidateDetail(slug);
    } catch (err) {
      if (err instanceof ApiError && err.code === "REVIEW_PACKAGE_INCOMPLETE") {
        toast.error(t("reviewPackageIncomplete"), { id: "submission-status" });
        return;
      }
      if (err instanceof ApiError) {
        const transition = parseInvalidStatusTransition(err);
        if (transition) {
          toast.error(
            t("invalidStatusTransition", {
              from: submissionStatusLabel(transition.from, tSub),
              to: submissionStatusLabel(transition.to, tSub),
            }),
            { id: "submission-status" },
          );
          return;
        }
      }
      showApiError(err, t("statusFailed"), { id: "submission-status" });
    } finally {
      setBusy(false);
    }
  }

  async function patchReminderSendAt(
    assignmentSlug: string,
    reminderId: string,
  ) {
    if (!sub) return;
    const reminder = Object.values(assignmentReminders)
      .flat()
      .find((row) => row.id === reminderId);
    const raw = reminder
      ? reminderRescheduleInputValue(
          reminderRescheduleAt,
          reminderId,
          reminder.sendAt,
        ).trim()
      : reminderRescheduleAt[reminderId]?.trim();
    const toastId = `submission-reminder-patch-${reminderId}`;
    if (!raw) {
      toast.error(t("reminderRescheduleRequired"), { id: toastId });
      return;
    }
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) {
      toast.error(t("reminderRescheduleRequired"), { id: toastId });
      return;
    }
    if (d.getTime() <= Date.now() + REMINDER_MIN_LEAD_MS) {
      toast.error(t("reminderSendAtTooSoon"), { id: toastId });
      return;
    }
    setBusy(true);
    setValidationError(null);
    try {
      const enc = encodeURIComponent(sub.slug);
      await apiJson(
        `/submissions/${enc}/assignments/${encodeURIComponent(assignmentSlug)}/reminders/${reminderId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ sendAt: d.toISOString() }),
        },
      );
      toast.success(t("reminderRescheduled"));
      setReminderRescheduleAt((prev) => {
        const next = { ...prev };
        delete next[reminderId];
        return next;
      });
      invalidateDetail(slug);
    } catch (err) {
      if (err instanceof ApiError && err.code === "REMINDER_SEND_AT_TOO_SOON") {
        toast.error(t("reminderSendAtTooSoon"), { id: toastId });
        return;
      }
      if (err instanceof ApiError && err.code === "EMAIL_DB_FORBIDDEN") {
        toast.error(err.message, { id: toastId });
        return;
      }
      showApiError(err, t("reminderRescheduleFailed"), { id: toastId });
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
    setValidationError(null);
    const toastId = `submission-reminder-cancel-${reminderId}`;
    try {
      const enc = encodeURIComponent(sub.slug);
      await apiJson(
        `/submissions/${enc}/assignments/${encodeURIComponent(assignmentSlug)}/reminders/${reminderId}/cancel`,
        { method: "POST" },
      );
      toast.success(t("reminderCancelled"));
      invalidateDetail(slug);
    } catch (err) {
      showApiError(err, t("reminderCancelFailed"), { id: toastId });
    } finally {
      setBusy(false);
    }
  }

  async function patchReviewMethod(nextMethod: string) {
    if (!sub) return;
    setBusy(true);
    setValidationError(null);
    try {
      await apiJson(
        `/submissions/${encodeURIComponent(sub.slug)}/review-method`,
        {
          method: "PATCH",
          body: JSON.stringify({ reviewMethod: nextMethod }),
        },
      );
      toast.success(t("reviewMethodUpdated"), { id: "submission-review-method" });
      invalidateDetail(slug);
    } catch (err) {
      showApiError(err, t("reviewMethodFailed"), {
        id: "submission-review-method",
      });
    } finally {
      setBusy(false);
    }
  }

  async function patchFileReviewStage(f: FileRow) {
    if (!sub) return;
    if (!submissionAllowsReviewConfiguration(sub.status)) return;
    const next = f.fileStage === "review" ? "submission" : "review";
    setBusy(true);
    setValidationError(null);
    try {
      await apiJson(
        `/submissions/${encodeURIComponent(sub.slug)}/files/${f.id}/stage`,
        {
          method: "PATCH",
          body: JSON.stringify({ fileStage: next }),
        },
      );
      toast.success(t("fileStageUpdated"), { id: "submission-file-stage" });
      invalidateDetail(slug);
    } catch (err) {
      showApiError(err, t("fileStageFailed"), { id: "submission-file-stage" });
    } finally {
      setBusy(false);
    }
  }

  if (loadError && !detail) {
    return (
      <ApiErrorState
        message={loadError}
        error={detailQuery.error}
        hint={
          detailQuery.error && getApiErrorKind(detailQuery.error) === "rateLimit"
            ? tApi("rateLimitHint")
            : undefined
        }
        onRetry={() => void detailQuery.refetch()}
        retryLabel={tApi("retry")}
        backHref="/submissions"
        backLabel={tSub("title")}
      />
    );
  }

  if (detailQuery.isPending || !sub || !me) {
    return (
      <main className={PAGE_SHELL_NARROW}>
        <LoadingCenter label={t("loading")} className="text-ink/60" />
      </main>
    );
  }

  const isAuthor =
    sub.authorId != null && sub.authorId !== "" && sub.authorId === me.id;
  const canManageOwn = canManageOwnSubmissions(me.permissions);
  const isEditorView = detail!.isEditorView;
  const showCorpusSimilarity =
    !isAuthor && (isEditorView || sub.status !== "draft");
  const canConfigureReview =
    isEditorView &&
    (me.permissions.includes(PERMISSION_SLUGS.SUBMISSION_CHANGE_STATUS) ||
      me.permissions.includes(PERMISSION_SLUGS.SUBMISSION_ASSIGN_REVIEWER));
  const canConfigureReviewForStatus = submissionAllowsReviewConfiguration(
    sub.status,
  );
  const showReviewConfiguration =
    canConfigureReview && canConfigureReviewForStatus;
  const allowReviewPackageEdits = showReviewConfiguration;
  const showFileWorkflowStage = allowReviewPackageEdits;
  const isPublishedSubmission = sub.status === "published";
  const canAssignReviewer =
    isEditorView &&
    me.permissions.includes(PERMISSION_SLUGS.SUBMISSION_ASSIGN_REVIEWER) &&
    canConfigureReviewForStatus;
  const canEditManuscript =
    canManageOwn &&
    isAuthor &&
    (sub.status === "draft" ||
      sub.status === "revisions_requested" ||
      sub.status === "copyediting");
  const canRemoveFiles =
    canManageOwn &&
    isAuthor &&
    (sub.status === "draft" || sub.status === "revisions_requested");
  const showMetadataForm =
    canManageOwn &&
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
    discipline: sub.discipline ?? null,
    disciplineSource: sub.disciplineSource ?? null,
    disciplineSuggested: sub.disciplineSuggested ?? null,
    disciplineSuggestedConfidence: sub.disciplineSuggestedConfidence ?? null,
    disciplineScopeInJournal: sub.disciplineScopeInJournal ?? null,
    disciplineScopeWarning: sub.disciplineScopeWarning ?? null,
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
    ...(isEditorView
      ? {}
      : {
          discipline: metadataFormInitial.discipline,
          disciplineSource: metadataFormInitial.disciplineSource,
          disciplineSuggested: metadataFormInitial.disciplineSuggested,
          disciplineSuggestedConfidence:
            metadataFormInitial.disciplineSuggestedConfidence,
          disciplineScopeInJournal: metadataFormInitial.disciplineScopeInJournal,
          disciplineScopeWarning: metadataFormInitial.disciplineScopeWarning,
        }),
  };
  const files = sub.files ?? [];
  const constructorContent = sub.constructorContent as
    | ConstructorContent
    | null
    | undefined;
  const { hasUploadedManuscript, hasConstructorDraft } = detectManuscriptSources(
    { files, constructorContent },
  );
  const constructorManuscriptFiles = files.filter(
    (f) => f.kind === "manuscript_constructor",
  );
  const attachedConstructorFile = constructorManuscriptFiles[0];
  const canEditConstructor =
    canManageOwn &&
    isAuthor &&
    (sub.status === "draft" || sub.status === "revisions_requested");
  const constructorDisplayName = hasConstructorDraft
    ? attachedConstructorFile?.originalName ??
      resolveConstructorDocxFileName(constructorContent)
    : "";
  const constructorStatusHint = hasConstructorDraft
    ? attachedConstructorFile
      ? ("attached" as const)
      : ("pending" as const)
    : undefined;
  const composeHref = `/submissions/${encodeURIComponent(sub.slug)}/compose`;
  const editableFileKinds = fileKindsForSubmissionDetail();
  const showReadonlyFiles = !canEditManuscript && files.length > 0;

  const mainShellCls = isEditorView
    ? submissionQueueShellCls
    : PAGE_SHELL_NARROW;
  const cardRounded = isEditorView ? "rounded-xl" : "rounded-lg";
  const contentPad = isEditorView ? "p-6 sm:p-8" : "p-6";

  const statuses = editorStatusOptions(sub.status);

  const statusLabel = submissionStatusLabel(sub.status, tSub);
  const tWfAny = tWf as unknown as (k: string) => string;

  // Checklist Calculations
  const hasTitle = sub.title?.trim().length > 0;
  const hasAbstract = sub.abstract?.trim().length > 0;
  const hasManuscript = hasUploadedManuscript || hasConstructorDraft;
  const hasDiscipline = sub.discipline?.trim() ? true : false;

  let completedSteps = 0;
  const totalSteps = 4;
  if (hasTitle) completedSteps++;
  if (hasAbstract) completedSteps++;
  if (hasManuscript) completedSteps++;
  if (hasDiscipline) completedSteps++;

  const progressPercent = Math.round((completedSteps / totalSteps) * 100);
  const strokeDasharray = 2 * Math.PI * 24;
  const strokeDashoffset = strokeDasharray - (progressPercent / 100) * strokeDasharray;

  return (
    <main className={mainShellCls}>
      <ConfirmDialog
        open={pendingRemoveFileId != null}
        onOpenChange={(open) => {
          if (!open) setPendingRemoveFileId(null);
        }}
        dir={locale === "ar" ? "rtl" : "ltr"}
        title={t("removeFile")}
        description={t("removeFileConfirm")}
        cancelLabel={tManuscript("cancel")}
        confirmLabel={t("removeFile")}
        onConfirm={() => void confirmRemoveSubmissionFile()}
        confirmDisabled={busy}
      />
      <ConfirmDialog
        open={clearConstructorOpen}
        onOpenChange={setClearConstructorOpen}
        dir={locale === "ar" ? "rtl" : "ltr"}
        title={tManuscript("clearConstructorTitle")}
        description={tManuscript("clearConstructorDescription")}
        cancelLabel={tManuscript("cancel")}
        confirmLabel={tManuscript("clearConstructorConfirm")}
        onConfirm={() => void confirmClearConstructorDraft()}
        confirmDisabled={busy}
      />

      {/* Premium Glassmorphic Workspace Hero Header */}
      <header className="relative overflow-hidden rounded-2xl border border-ink/10 dark:border-white/10 bg-surface/60 dark:bg-white/5 backdrop-blur-md p-6 sm:p-8 shadow-xs hover:border-accent/15 transition-all duration-300">
        <div className="absolute -right-20 -top-20 size-48 rounded-full bg-accent/5 blur-3xl" />
        <div className="absolute -left-20 -bottom-20 size-48 rounded-full bg-accent-2/5 blur-3xl" />
        
        {isEditorView ? (
          <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-ink/60">
            <Link href="/submissions" className="text-accent hover:text-accent/80 transition-colors">
              {t("back")}
            </Link>
            <span className="text-ink/20" aria-hidden>·</span>
            <Link href="/editor" className="hover:text-accent transition-colors">
              {t("backToEditorQueue")}
            </Link>
          </nav>
        ) : (
          <nav className="text-xs font-medium">
            <Link href="/submissions" className="text-accent hover:text-accent/80 transition-colors">
              {t("back")}
            </Link>
          </nav>
        )}

        {validationError && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50/80 dark:bg-red-950/20 dark:border-red-900/30 px-4 py-3 text-sm text-red-800 dark:text-red-400 animate-fade-in"
          >
            <p className="min-w-0 flex-1 pt-0.5">{validationError}</p>
            <button
              type="button"
              onClick={() => setValidationError(null)}
              className="shrink-0 rounded-lg p-1 text-lg leading-none text-red-800 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/40 transition-colors"
              aria-label={t("dismissError")}
            >
              ×
            </button>
          </div>
        )}

        <div className="mt-6 flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-accent/8 dark:bg-accent/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent font-semibold">
                {sub.articleType ? tWfAny(`articleType_${sub.articleType}`) : (isAr ? "مخطوطة بحثية" : "Manuscript")}
              </span>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold shadow-2xs ${
                sub.status === "draft" 
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                  : sub.status === "under_review"
                    ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                    : sub.status === "accepted" || sub.status === "published"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                      : "bg-ink/5 text-ink/70 dark:bg-white/10 dark:text-white/70"
              }`}>
                {sub.status === "draft" && <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />}
                {sub.status === "under_review" && <span className="size-1.5 rounded-full bg-blue-500 animate-pulse" />}
                {statusLabel}
              </span>
            </div>

            <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-ink leading-snug">
              {sub.title}
            </h1>
            {sub.titleAr?.trim() ? (
              <p
                dir="rtl"
                className="font-serif text-xl sm:text-2xl font-semibold leading-snug text-ink/90 pt-1 border-t border-ink/[0.04] dark:border-white/[0.04]"
              >
                {sub.titleAr}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 text-xs text-ink/50 dark:text-white/40">
              <span>
                {isAr ? "آخر تحديث:" : "Last updated:"} <span className="font-medium text-ink/70 dark:text-white/60">{new Date(sub.updatedAt).toLocaleDateString(locale, { dateStyle: 'medium' })}</span>
              </span>
              <span className="hidden sm:inline" aria-hidden>•</span>
              <span>
                {isAr ? "معرف الطلب:" : "ID:"} <span className="font-mono bg-ink/5 dark:bg-white/5 px-1.5 py-0.5 rounded">{sub.slug}</span>
              </span>
            </div>
          </div>
        </div>

        {sub.reviewMethod === "double_anonymous" ? (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200/40 bg-amber-500/[0.04] px-4 py-3 text-xs text-amber-800 dark:text-amber-400">
            <svg className="size-5 shrink-0 text-amber-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="leading-relaxed">{t("doubleBlindAuthorNotice")}</p>
          </div>
        ) : null}
      </header>

      {/* Dual Column Layout Grid */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column (Main Workspace) */}
        <div className="lg:col-span-8 space-y-6">
          {showMetadataReadonly && (
            <section className={`${cardRounded} border border-ink/10 dark:border-white/10 bg-surface shadow-xs ${contentPad} hover:border-accent/15 transition-colors duration-300`}>
              <h2 className="font-serif text-lg font-semibold text-ink">
                {tWf("metadataReadonlyTitle")}
              </h2>
              <p className="mt-1 text-xs text-ink/65">{tWf("metadataReadonlyHint")}</p>
              <div className="mt-4">
                <SubmissionMetadataDisplay
                  key={sub.updatedAt}
                  initial={metadataDisplayInitial}
                />
              </div>
            </section>
          )}

          {showMetadataForm && (
            <section className={`${cardRounded} border border-ink/10 dark:border-white/10 bg-surface shadow-xs ${contentPad}`}>
              <h2 className="font-serif text-lg font-semibold text-ink">
                {tWf("metadataEditTitle")}
              </h2>
              <p className="mt-1 text-xs text-ink/65">{tWf("metadataEditHint")}</p>
              <div className="mt-6">
                <SubmissionMetadataForm
                  key={sub.updatedAt}
                  slug={sub.slug}
                  canEdit
                  initial={metadataFormInitial}
                  onSaved={() => invalidateDetail(slug)}
                  onDisciplineUpdated={() => invalidateDetail(slug)}
                  onError={(msg) => {
                    if (msg.trim()) toast.error(msg, { id: "submission-metadata-form" });
                  }}
                />
              </div>
            </section>
          )}

          {showAbstractSection && (
            <section className={`${cardRounded} border border-ink/10 dark:border-white/10 bg-surface shadow-xs ${contentPad} hover:border-accent/15 transition-colors duration-300`}>
              <h2 className="font-serif text-lg font-semibold text-ink">{t("abstractsSection")}</h2>
              <div className="mt-4 space-y-6">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ink/40">
                    {tWf("abstractLabelEn")}
                  </h3>
                  <p
                    dir="ltr"
                    className="mt-2 whitespace-pre-wrap text-sm text-ink/80 leading-relaxed font-sans"
                  >
                    {sub.abstract}
                  </p>
                </div>
                {sub.abstractAr?.trim() ? (
                  <div className="border-t border-ink/[0.05] dark:border-white/[0.05] pt-4 mt-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-ink/40">
                      {tWf("abstractLabelAr")}
                    </h3>
                    <p
                      dir="rtl"
                      className="mt-2 whitespace-pre-wrap text-base text-ink/80 leading-relaxed font-serif"
                    >
                      {sub.abstractAr}
                    </p>
                  </div>
                ) : null}
              </div>
            </section>
          )}

          {canEditManuscript && (
            <section className={`space-y-6 ${cardRounded} border border-ink/10 dark:border-white/10 bg-surface shadow-xs ${contentPad}`}>
              <div>
                <h2 className="font-serif text-lg font-semibold text-ink">
                  {t("manuscript")}
                </h2>
                <p className="mt-1 text-xs text-ink/75">{t("uploadSubtitle")}</p>
                {canEditConstructor ? (
                  <p className="mt-2 text-xs text-ink/60">
                    {tManuscript("dualPathHint")}
                  </p>
                ) : null}
              </div>
              
              {canEditConstructor && (
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={composeHref}
                    data-testid="open-constructor"
                    className="inline-flex items-center justify-center rounded-xl border border-accent bg-accent/8 px-4 py-2 text-sm font-semibold text-accent shadow-2xs hover:bg-accent/15 select-none active:scale-[0.98] transition-all duration-200"
                  >
                    {tManuscript("openConstructor")}
                  </Link>
                </div>
              )}

              <div className="space-y-5">
                {editableFileKinds.map(({ kind, required }) => (
                  <div
                    key={kind}
                    className="rounded-xl border border-ink/10 dark:border-white/10 bg-paper/40 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-ink">
                        {tWfAny(`fileKind_${kind}`)}
                        {required ? (
                          <span className="ms-1.5 text-[10px] font-bold text-red-700 bg-red-50 dark:bg-red-950/20 px-1.5 py-0.5 rounded uppercase tracking-wider">
                            {tWf("requiredBadge")}
                          </span>
                        ) : (
                          <span className="ms-1.5 text-[10px] font-semibold text-ink/50 bg-ink/5 dark:bg-white/5 px-1.5 py-0.5 rounded uppercase tracking-wider">
                            {tWf("optionalBadge")}
                          </span>
                        )}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink/55 leading-relaxed">{tWfAny(`fileKindHint_${kind}`)}</p>
                    {kind === "manuscript" && hasConstructorDraft ? (
                      <div className="mt-3">
                        <ConstructorManuscriptRow
                          displayName={constructorDisplayName}
                          editHref={composeHref}
                          statusHint={constructorStatusHint}
                          disabled={busy}
                          onRemove={
                            canEditConstructor
                              ? () => setClearConstructorOpen(true)
                              : undefined
                          }
                        />
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <input
                        id={`${fileInputId}-${kind}`}
                        type="file"
                        accept={
                          kind === "figure" || kind === "table"
                            ? ACCEPT_FIGURE
                            : kind === "supplementary"
                              ? ACCEPT_SUPPLEMENTARY
                              : ACCEPT_MANUSCRIPT
                        }
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
                        className={`inline-flex cursor-pointer rounded-xl border border-ink/20 dark:border-white/20 bg-paper px-4 py-2 text-xs font-semibold text-ink shadow-2xs hover:border-accent/40 hover:bg-ink/[0.02] active:scale-[0.98] select-none transition-all duration-150 ${busy ? "pointer-events-none opacity-50" : ""}`}
                      >
                        {t("chooseFile")}
                      </label>
                    </div>
                    {kind === "manuscript" && canEditConstructor ? (
                      <div className="mt-4 pt-4 border-t border-ink/[0.05] dark:border-white/[0.05]">
                        <ReviewManuscriptPresentationPicker
                          value={reviewPresentation}
                          onChange={(next) => {
                            setReviewPresentation(next);
                            writeReviewManuscriptPresentation(sub.slug, next);
                          }}
                          hasUploadedManuscript={hasUploadedManuscript}
                          hasConstructorDraft={hasConstructorDraft}
                          disabled={busy}
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              
              {uploadingName && (
                <p className="flex items-center gap-2 text-sm text-ink/70">
                  <Spinner size="sm" />
                  <span className="font-medium text-ink">{uploadingName}</span>
                  <span className="sr-only">{t("uploading")}</span>
                </p>
              )}
              <p className="text-xs text-ink/55">{t("uploadHint")}</p>
              {files.length > 0 && (
                <div className="pt-4 border-t border-ink/[0.05] dark:border-white/[0.05]">
                  <h3 className="text-sm font-semibold text-ink mb-3">{t("yourFiles")}</h3>
                  <ul className="mt-2 divide-y divide-ink/[0.05] dark:divide-white/[0.05]">
                    {files.map((f) => (
                      <SubmissionFileRow
                        key={f.id}
                        f={f}
                        showRemove={canRemoveFiles}
                        busy={busy}
                        t={t}
                        tWf={tWf}
                        showWorkflowStageBadge={showFileWorkflowStage}
                        showPublicBadge={isPublishedSubmission}
                        editorCanTogglePackage={allowReviewPackageEdits}
                        onTogglePackage={
                          allowReviewPackageEdits
                            ? (row) => void patchFileReviewStage(row)
                            : undefined
                        }
                        onDownload={(row) => void downloadSubmissionFile(row)}
                        onRemove={(fileId) => requestRemoveSubmissionFile(fileId)}
                      />
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {showReadonlyFiles && (
            <section className={`${cardRounded} border border-ink/10 dark:border-white/10 bg-surface shadow-xs ${contentPad}`}>
              <h2 className="font-serif text-lg font-semibold text-ink">
                {t("attachedFiles")}
              </h2>
              {isEditorView && isPublishedSubmission && (
                <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-ink/70">
                  {t("attachedFilesPublishedHint")}
                </p>
              )}
              <ul className={isEditorView ? "mt-4 space-y-3" : "mt-2 divide-y divide-ink/[0.05] dark:divide-white/[0.05]"}>
                {files.map((f) => (
                  <SubmissionFileRow
                    key={f.id}
                    f={f}
                    showRemove={false}
                    busy={busy}
                    t={t}
                    tWf={tWf}
                    softRows={isEditorView}
                    showWorkflowStageBadge={showFileWorkflowStage}
                    showPublicBadge={isPublishedSubmission}
                    editorCanTogglePackage={allowReviewPackageEdits}
                    onTogglePackage={
                      allowReviewPackageEdits
                        ? (row) => void patchFileReviewStage(row)
                        : undefined
                    }
                    onDownload={(row) => void downloadSubmissionFile(row)}
                  />
                ))}
              </ul>
            </section>
          )}

          {/* Discipline panel for editors */}
          {isEditorView && (
            <section className="rounded-xl border border-ink/10 dark:border-white/10 bg-surface p-6 shadow-xs space-y-4">
              <h2 className="font-serif text-lg font-semibold text-ink">
                {t("editorPanelTitle")}
              </h2>
              <p className="max-w-2xl text-sm leading-relaxed text-ink/70">
                {t("editorPanelHint")}
              </p>
              <div className="pt-2">
                <SubmissionDisciplinePanel
                  slug={sub.slug}
                  mode="editor"
                  canEdit={false}
                  fields={{
                    discipline: sub.discipline ?? null,
                    disciplineSource: sub.disciplineSource ?? null,
                    disciplineSuggested: sub.disciplineSuggested ?? null,
                    disciplineSuggestedConfidence:
                      sub.disciplineSuggestedConfidence ?? null,
                    disciplineScopeInJournal: sub.disciplineScopeInJournal ?? null,
                    disciplineScopeWarning: sub.disciplineScopeWarning ?? null,
                  }}
                  onUpdated={() => invalidateDetail(slug)}
                />
                {showCorpusSimilarity && (
                  <CorpusSimilarityPanel slug={sub.slug} />
                )}
              </div>
            </section>
          )}

          {showCorpusSimilarity && !isEditorView && (
            <section
              className={`${cardRounded} border border-ink/10 dark:border-white/10 bg-surface shadow-xs ${contentPad}`}
            >
              <CorpusSimilarityPanel slug={sub.slug} />
            </section>
          )}

          {isEditorView && (
            <section className={`${cardRounded} border border-ink/10 dark:border-white/10 bg-surface shadow-xs ${contentPad}`}>
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
                        className="rounded-xl border border-ink/10 dark:border-white/10 bg-paper/50 p-4 sm:p-5"
                      >
                        <p className="text-xs font-semibold uppercase tracking-wider text-ink/40">
                          {reviewerLine}
                        </p>
                        <p className="mt-1 text-xs text-ink/50">
                          {t("reviewSubmitted")}: {submitted}
                        </p>
                        <p className="mt-4 text-sm font-bold text-ink">
                          {t("reviewRecommendation")}:{" "}
                          <span className="text-accent">{recommendationLabel(r.recommendation, tCommon)}</span>
                        </p>
                        <div className="mt-4">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-ink/40">
                            {t("reviewForAuthor")}
                          </h3>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/80 font-sans">
                            {r.commentsForAuthor}
                          </p>
                        </div>
                        <div className="mt-4 border-t border-ink/10 dark:border-white/10 pt-4">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-ink/40">
                            {t("reviewForEditorOnly")}
                          </h3>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/80 font-sans">
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

          {isAuthor && !isEditorView && authorReviews.length > 0 && (
            <section className={`${cardRounded} border border-ink/10 dark:border-white/10 bg-surface shadow-xs ${contentPad}`}>
              <h2 className="font-serif text-lg font-semibold text-ink">
                {t("reviewsSectionAuthor")}
              </h2>
              {reviewsError && (
                <p className="mt-3 text-sm text-red-700">{reviewsError}</p>
              )}
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
                      className="rounded-xl border border-ink/10 dark:border-white/10 bg-paper/50 p-4 sm:p-5"
                    >
                      <p className="text-sm font-bold text-ink">
                        {t("reviewFeedbackItem", { n: idx + 1 })}
                      </p>
                      <p className="mt-1 text-xs text-ink/50">
                        {t("reviewSubmitted")}: {submitted}
                      </p>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink/80 font-sans">
                        {r.commentsForAuthor}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {sub && me && (
            <CopyeditSection
              submissionSlug={sub.slug}
              submissionStatus={sub.status}
              isAuthor={isAuthor}
              isEditor={isEditorView}
              permissions={me.permissions}
              onReload={() => invalidateDetail(slug)}
            />
          )}
        </div>

        {/* Right Column (Sidebar Widgets) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Author Submissions Readiness Checklist */}
          {isAuthor && !isEditorView && (sub.status === "draft" || sub.status === "revisions_requested") && (
            <div className="rounded-2xl border border-ink/10 dark:border-white/10 bg-surface p-6 shadow-xs space-y-6 relative overflow-hidden">
              <div className="absolute -right-16 -top-16 size-36 rounded-full bg-accent/5 blur-2xl" />
              
              <div className="flex items-center justify-between border-b border-ink/[0.06] dark:border-white/[0.06] pb-3">
                <h3 className="font-serif text-base font-semibold text-ink">
                  {isAr ? "جاهزية تقديم المخطوطة" : "Submission Readiness"}
                </h3>
                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent uppercase tracking-wider">
                  {progressPercent}%
                </span>
              </div>

              {/* Circular Progress and stats */}
              <div className="flex items-center gap-4">
                <div className="relative size-16 shrink-0">
                  <svg className="size-full -rotate-90">
                    <circle
                      cx="32"
                      cy="32"
                      r="24"
                      className="stroke-ink/5 dark:stroke-white/5"
                      strokeWidth="5"
                      fill="none"
                    />
                    <circle
                      cx="32"
                      cy="32"
                      r="24"
                      className="stroke-accent transition-all duration-500 ease-out"
                      strokeWidth="5"
                      strokeDasharray={strokeDasharray}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      fill="none"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center font-mono text-xs font-bold text-ink">
                    {progressPercent}%
                  </div>
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-xs font-semibold text-ink">
                    {isAr ? "خطوات المتطلبات الأساسية" : "Manuscript Requirements"}
                  </p>
                  <p className="text-[11px] text-ink/50 leading-relaxed">
                    {isAr 
                      ? `تم إكمال ${completedSteps} من أصل ${totalSteps} متطلبات مطلوبة للتقديم للتقييم.`
                      : `Completed ${completedSteps} of ${totalSteps} vital manuscript details.`}
                  </p>
                </div>
              </div>

              {/* Task list */}
              <ul className="space-y-3 pt-2 text-xs">
                <li className="flex items-center gap-3">
                  <span className={`flex size-5 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
                    hasTitle && hasAbstract
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "border-ink/20 dark:border-white/20 bg-paper text-transparent"
                  }`}>
                    ✓
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">{isAr ? "العنوان والملخص بالإنجليزية" : "English Title & Abstract"}</p>
                    <p className="text-[10px] text-ink/50">{isAr ? "مطلوب لتصنيف المخطوطة" : "Required for classification"}</p>
                  </div>
                </li>

                <li className="flex items-center gap-3">
                  <span className={`flex size-5 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
                    sub.titleAr?.trim() && sub.abstractAr?.trim()
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "border-ink/10 dark:border-white/10 bg-paper/30 text-transparent"
                  }`}>
                    ✓
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink/80">
                      {isAr ? "العنوان والملخص بالعربية" : "Arabic Title & Abstract"}{" "}
                      <span className="text-[10px] font-normal text-ink/40">({isAr ? "اختياري" : "Optional"})</span>
                    </p>
                    <p className="text-[10px] text-ink/40">{isAr ? "يساعد في التصفح المحلي" : "Enhances local discovery"}</p>
                  </div>
                </li>

                <li className="flex items-center gap-3">
                  <span className={`flex size-5 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
                    hasManuscript
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "border-ink/20 dark:border-white/20 bg-paper text-transparent"
                  }`}>
                    ✓
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">{isAr ? "ملف المخطوطة المرفق" : "Manuscript File"}</p>
                    <p className="text-[10px] text-ink/50">
                      {hasManuscript 
                        ? (hasConstructorDraft ? (isAr ? "مسودة الوورد منشأة" : "Word Constructor Draft") : (isAr ? "مرفوعة كمستند" : "Uploaded Document"))
                        : (isAr ? "لم يتم إرفاق ملف بعد" : "Document file not uploaded")}
                    </p>
                  </div>
                </li>

                <li className="flex items-center gap-3">
                  <span className={`flex size-5 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
                    hasDiscipline
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "border-ink/20 dark:border-white/20 bg-paper text-transparent"
                  }`}>
                    ✓
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">{isAr ? "التخصص والمسار العلمي" : "Discipline & Fields"}</p>
                    <p className="text-[10px] text-ink/50">
                      {hasDiscipline
                        ? formatDiscipline(sub.discipline)
                        : (isAr ? "حدد التخصص العلمي للمقال" : "Required for editor routing")}
                    </p>
                  </div>
                </li>
              </ul>

              {/* Submit Section inside Checklist */}
              {canEditConstructor && (
                <div className="pt-4 border-t border-ink/[0.06] dark:border-white/[0.06] space-y-3">
                  <p className="text-[10px] text-ink/50 leading-relaxed">
                    {t("submitIrreversibleHint")}
                  </p>
                  <button
                    type="button"
                    disabled={busy || !hasManuscript}
                    onClick={() => void submitForReview()}
                    className="w-full inline-flex items-center justify-center rounded-xl bg-accent px-4 py-3 text-xs font-bold text-white shadow-2xs hover:bg-accent/90 active:scale-[0.98] select-none transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {t("submitForReview")}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Author Submission Workflow Stage Tracker */}
          {isAuthor && !isEditorView && !(sub.status === "draft" || sub.status === "revisions_requested") && (
            <div className="rounded-2xl border border-ink/10 dark:border-white/10 bg-surface p-6 shadow-xs space-y-5">
              <h3 className="font-serif text-base font-semibold text-ink border-b border-ink/[0.06] dark:border-white/[0.06] pb-3">
                {isAr ? "مسار تقدم المعاملة" : "Workflow Progress"}
              </h3>
              
              <div className="relative ps-6 space-y-6 before:absolute before:start-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-ink/[0.06] dark:before:bg-white/[0.06]">
                {/* Step 1: Submitted */}
                <div className="relative">
                  <span className="absolute -start-6 top-0.5 flex size-4.5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">✓</span>
                  <p className="text-xs font-bold text-ink">{isAr ? "تم تقديم المخطوطة" : "Manuscript Submitted"}</p>
                  <p className="text-[10px] text-ink/50">{isAr ? "تم إرسال الملفات بنجاح" : "Files successfully archived"}</p>
                </div>

                {/* Step 2: Under Review */}
                <div className="relative">
                  <span className={`absolute -start-6 top-0.5 flex size-4.5 items-center justify-center rounded-full border text-[10px] font-bold ${
                    sub.status === "under_review" || sub.status === "revisions_requested"
                      ? "border-blue-500 bg-blue-500 text-white animate-pulse"
                      : sub.status === "accepted" || sub.status === "published"
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-ink/20 dark:border-white/20 bg-paper text-ink/40"
                  }`}>{sub.status === "accepted" || sub.status === "published" ? "✓" : "2"}</span>
                  <p className={`text-xs font-bold ${sub.status === "under_review" ? "text-blue-600 dark:text-blue-400" : "text-ink"}`}>
                    {isAr ? "التقييم والتحكيم النظير" : "Peer Review Phase"}
                  </p>
                  <p className="text-[10px] text-ink/50">
                    {sub.status === "under_review" 
                      ? (isAr ? "تخضع المقالة لمراجعة الخبراء حالياً" : "Currently being read by peer reviewers")
                      : (sub.status === "accepted" || sub.status === "published" ? (isAr ? "تم الانتهاء من التقييم" : "Review process finished") : (isAr ? "انتظار بدء التقييم" : "Waiting for review assignments"))}
                  </p>
                </div>

                {/* Step 3: Decision */}
                <div className="relative">
                  <span className={`absolute -start-6 top-0.5 flex size-4.5 items-center justify-center rounded-full border text-[10px] font-bold ${
                    sub.status === "accepted"
                      ? "border-emerald-500 bg-emerald-500 text-white animate-pulse"
                      : sub.status === "published"
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-ink/20 dark:border-white/20 bg-paper text-ink/40"
                  }`}>{sub.status === "published" ? "✓" : "3"}</span>
                  <p className="text-xs font-bold text-ink">{isAr ? "القرار التحريري" : "Editorial Decision"}</p>
                  <p className="text-[10px] text-ink/50">
                    {sub.status === "accepted" 
                      ? (isAr ? "تم قبول البحث للنشر" : "Accepted for official publication")
                      : (sub.status === "published" ? (isAr ? "تمت الموافقة والنشر" : "Final approval granted") : (isAr ? "في انتظار قرار رئيس التحرير" : "Waiting for final editorial outcome"))}
                  </p>
                </div>

                {/* Step 4: Published */}
                <div className="relative">
                  <span className={`absolute -start-6 top-0.5 flex size-4.5 items-center justify-center rounded-full border text-[10px] font-bold ${
                    sub.status === "published"
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-ink/20 dark:border-white/20 bg-paper text-ink/40"
                  }`}>{sub.status === "published" ? "✓" : "4"}</span>
                  <p className={`text-xs font-bold ${sub.status === "published" ? "text-emerald-600 dark:text-emerald-400" : "text-ink"}`}>
                    {isAr ? "البحث منشور بالكامل" : "Fully Published"}
                  </p>
                  <p className="text-[10px] text-ink/50">
                    {sub.status === "published" 
                      ? (isAr ? "متوفر حالياً للعامة في الكتالوج" : "Live in active journal catalog")
                      : (isAr ? "سيتم التوزيع فور قبول المعاملة" : "Distributed upon production sign-off")}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Editor Command Center in Sidebar */}
          {isEditorView && (
            <div className="rounded-2xl border border-ink/10 dark:border-white/10 bg-surface p-6 shadow-xs space-y-6 relative overflow-hidden">
              <div className="absolute -right-16 -top-16 size-36 rounded-full bg-accent/5 blur-2xl" />
              
              <div className="flex items-center justify-between border-b border-ink/[0.06] dark:border-white/[0.06] pb-3">
                <h2 className="font-serif text-base font-semibold text-ink">
                  {isAr ? "مركز التحكم بالمحرر" : "Editor Command Center"}
                </h2>
                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[9px] font-bold text-accent uppercase tracking-wider">
                  {isAr ? "إشراف" : "Admin"}
                </span>
              </div>

              {showReviewConfiguration && (
                <div className="rounded-xl border border-ink/10 dark:border-white/10 bg-paper/40 p-4 space-y-3">
                  <div className="flex flex-col gap-1 text-xs font-medium text-ink">
                    <span id={reviewMethodSelectId}>{t("reviewMethodLabel")}</span>
                    <SimpleSelect
                      value={sub.reviewMethod ?? "double_anonymous"}
                      onValueChange={(v) => void patchReviewMethod(v)}
                      options={[
                        { value: "open", label: t("reviewMethod_open") },
                        { value: "anonymous", label: t("reviewMethod_anonymous") },
                        { value: "double_anonymous", label: t("reviewMethod_double_anonymous") },
                      ]}
                      disabled={busy}
                      className="w-full"
                      aria-labelledby={reviewMethodSelectId}
                    />
                  </div>
                  <p className="text-[10px] leading-relaxed text-ink/65">
                    {t("reviewMethodHint")}
                  </p>
                  <p className="text-[10px] leading-relaxed text-amber-800 dark:text-amber-400">
                    {t("reviewPackageEditorHint")}
                  </p>
                </div>
              )}

              {/* Set Status Box */}
              <div className="rounded-xl border border-ink/10 dark:border-white/10 bg-paper/40 p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink/40">
                  {isAr ? "تحديث حالة الطلب" : "Update Status"}
                </h3>
                <p className="text-[10px] text-ink/50">
                  {t("editorWorkflowColumnHint")}
                </p>
                <div className="flex flex-col gap-1 text-sm font-medium text-ink">
                  <span id="status-select-label" className="sr-only">{t("setStatus")}</span>
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
                  className="w-full rounded-xl bg-ink text-paper dark:bg-white dark:text-paper px-4 py-2.5 text-xs font-bold shadow-2xs hover:bg-ink/90 active:scale-[0.98] select-none transition-all duration-150 disabled:opacity-50"
                >
                  {t("applyStatus")}
                </button>
              </div>

              {/* Assign Reviewer Box */}
              <div className="rounded-xl border border-ink/10 dark:border-white/10 bg-paper/40 p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink/40">
                  {isAr ? "تعيين مراجع" : "Assign Reviewer"}
                </h3>
                {canAssignReviewer ? (
                  <>
                    <p className="text-[10px] text-ink/50">
                      {t("editorAssignColumnHint")}
                    </p>
                    {editorAssignmentRows.some(
                      (a) => a.status === "invited" || a.status === "accepted",
                    ) && (
                      <p className="text-[10px] text-ink/60">
                        {t("reviewerAssignAdditionalHint")}
                      </p>
                    )}
                    {reviewersLoadError && (
                      <p className="text-[10px] text-red-600">{reviewersLoadError}</p>
                    )}
                    <ReviewerSuggestionsPanel
                      slug={sub.slug}
                      disabled={busy || !!reviewersLoadError}
                      onPick={setReviewerPick}
                    />
                    <div className="flex flex-col gap-1 text-sm font-medium text-ink">
                      <span id="reviewer-select-label" className="sr-only">{t("reviewerLabel")}</span>
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
                        disabled={busy || !!reviewersLoadError}
                        className="w-full animate-fade-in"
                        aria-labelledby="reviewer-select-label"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={busy || !reviewerPick.trim() || !!reviewersLoadError}
                      onClick={() => void assignReviewer()}
                      className="w-full rounded-xl bg-accent px-4 py-2.5 text-xs font-bold text-white shadow-2xs hover:bg-accent/90 active:scale-[0.98] select-none transition-all duration-150 disabled:opacity-50"
                    >
                      {t("assignReviewer")}
                    </button>
                    {!reviewersLoadError && reviewerCandidates.length === 0 && (
                      <p className="text-[10px] text-ink/50 text-center">
                        {t("noReviewersAvailable")}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-[10px] text-ink/50">
                    {t("reviewerAssignClosedHint")}
                  </p>
                )}
              </div>

              {/* Active assignments and email reminders */}
              {editorAssignmentRows.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-ink/[0.06] dark:border-white/[0.06]">
                  <h3 className="font-serif text-sm font-semibold text-ink">
                    {t("editorAssignmentsTitle")}
                  </h3>
                  <div className="space-y-3">
                    {editorAssignmentRows.map((a) => {
                      const name =
                        a.reviewer?.displayName?.trim() ||
                        a.reviewer?.email?.trim() ||
                        a.reviewerId;
                      const asg = a.slug ? String(a.slug) : "";
                      const remList = asg ? (assignmentReminders[asg] ?? []) : [];
                      const remindersFailed = asg
                        ? reminderLoadFailedByAssignment[asg] === true
                        : false;
                      return (
                        <div key={a.id} className="rounded-xl border border-ink/10 dark:border-white/10 bg-paper/60 p-4 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium text-xs text-ink truncate max-w-[120px]" title={name}>{name}</span>
                            <span className={assignmentStatusPillClass(a.status)}>
                              {assignmentStatusLabel(a.status, tAssign)}
                            </span>
                          </div>
                          <div className="border-t border-ink/10 dark:border-white/10 pt-3 space-y-2 text-[11px]">
                            <p className="font-semibold text-ink/80">{t("emailRemindersTitle")}</p>
                            {canManageReminders && (
                              <p className="text-[10px] leading-relaxed text-ink/55">
                                {t("emailRemindersHint")}
                              </p>
                            )}
                            {!a.slug ? (
                              <p className="text-amber-700">{t("reminderNoSlug")}</p>
                            ) : remindersFailed ? (
                              <p className="text-red-700 dark:text-red-400">
                                {t("reminderLoadFailed")}
                              </p>
                            ) : remList.length === 0 ? (
                              <p className="text-ink/40">{t("reminderNoneScheduled")}</p>
                            ) : (
                              <div className="space-y-3">
                                {remList.map((r) => {
                                  const rescheduleValue = reminderRescheduleInputValue(
                                    reminderRescheduleAt,
                                    r.id,
                                    r.sendAt,
                                  );
                                  return (
                                    <div key={r.id} className="p-2 rounded-lg bg-ink/5 dark:bg-white/5 space-y-2 border border-ink/[0.03]">
                                      <div className="flex items-center justify-between text-[10px] font-medium">
                                        <span className="text-ink/50">
                                          {r.kind === "review_overdue" ? t("reminderKindOverdue") : t("reminderKindDueSoon")}
                                        </span>
                                        <span className="px-1 py-0.5 rounded bg-ink/10 dark:bg-white/10 font-mono text-[9px]">
                                          {r.status}
                                        </span>
                                      </div>
                                      <p className="text-[10px] text-ink/65">
                                        <span className="font-medium text-ink/50">{t("reminderSendAt")}: </span>
                                        <time className="font-mono" dateTime={r.sendAt}>
                                          {new Date(r.sendAt).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" })}
                                        </time>
                                      </p>
                                      {r.status === "pending" && canManageReminders && (
                                        <div className="flex flex-col gap-1.5 pt-1.5 border-t border-ink/[0.05] dark:border-white/[0.05]">
                                          <label className="text-[10px] font-medium text-ink/55">
                                            {t("reminderReschedulePlaceholder")}
                                          </label>
                                          <input
                                            type="datetime-local"
                                            step={60}
                                            min={minReminderRescheduleDatetimeLocal(REMINDER_MIN_LEAD_MS)}
                                            className="rounded border border-ink/15 bg-paper px-2 py-1 text-[10px] text-ink w-full"
                                            value={rescheduleValue}
                                            onChange={(e) =>
                                              setReminderRescheduleAt((prev) => ({
                                                ...prev,
                                                [r.id]: e.target.value,
                                              }))
                                            }
                                          />
                                          <div className="flex items-center gap-1">
                                            <button
                                              type="button"
                                              disabled={busy || !rescheduleValue.trim()}
                                              className="flex-1 rounded bg-ink/80 hover:bg-ink dark:bg-white/80 dark:hover:bg-white dark:text-paper px-2 py-1 text-[9px] font-semibold text-paper disabled:opacity-50 transition-colors"
                                              onClick={() => void patchReminderSendAt(asg, r.id)}
                                            >
                                              {t("reminderApplyReschedule")}
                                            </button>
                                            <button
                                              type="button"
                                              disabled={busy}
                                              className="rounded border border-red-200 dark:border-red-900/30 px-2 py-1 text-[9px] font-semibold text-red-800 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-50 transition-colors"
                                              onClick={() => void cancelReminderRow(asg, r.id)}
                                            >
                                              {t("reminderCancel")}
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
