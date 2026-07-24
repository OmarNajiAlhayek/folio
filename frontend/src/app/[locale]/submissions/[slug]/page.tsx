'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, useId } from 'react';
import {
  FileText,
  Image as ImageIcon,
  Paperclip,
  Table,
  TriangleAlert,
} from 'lucide-react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { useParams } from 'next/navigation';
import { apiBlob, apiJson, apiUpload, ApiError } from '@/lib/api';
import {
  ACCEPT_FIGURE,
  ACCEPT_MANUSCRIPT,
  ACCEPT_SUPPLEMENTARY,
} from '@/lib/upload-accept';
import { ApiErrorState } from '@/components/api-error-state';
import { ReviewConsensusPanel } from '@/components/ReviewConsensusPanel';
import { EditorAssignmentDiscussion } from '@/components/EditorAssignmentDiscussion';
import { Spinner } from '@/components/ui/spinner';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonLoadingStatus } from '@/components/ui/skeleton-loading-status';
import { Button } from '@/components/ui/button';
import { FileDropZone } from '@/components/ui/file-drop-zone';
import { toast } from '@/lib/toast';
import { getApiErrorKind } from '@/lib/api-error-message';
import { useApiErrorMessages } from '@/lib/use-api-error-messages';
import { useToastApiError } from '@/lib/use-toast-api-error';
import {
  canManageAssignmentReminders,
  canManageOwnSubmissions,
  PERMISSION_SLUGS,
} from '@/lib/permissions';
import {
  minReminderRescheduleDatetimeLocal,
  reminderRescheduleInputValue,
} from '@/lib/reminder-datetime-local';
import {
  useSubmissionDetail,
  type SubmissionDetailPayload,
  type SubmissionRecord,
  type ReviewForEditor,
  type ReviewForAuthor,
} from '@/lib/queries/submissions';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { SimpleSelect } from '@/components/ui/select';
import {
  assignmentStatusLabel,
  assignmentStatusPillClass,
  statusPillClass,
  submissionStatusLabel,
  submissionQueueShellCls,
} from '@/lib/submission-list-ui';
import { PAGE_SHELL_NARROW } from '@/lib/page-shell';
import {
  assignReviewerSchema,
  fileExceedsUploadLimit,
  formatZodIssues,
  joinValidationBulletList,
  MAX_UPLOAD_MB,
  safeParseResult,
  updateSubmissionStatusSchema,
} from '@/lib/validation';
import {
  fileKindsForSubmissionDetail,
  SubmissionMetadataDisplay,
  SubmissionMetadataForm,
  type ContributorRow,
  type MetadataDisplayInitial,
  type SubmissionMetadataFormHandle,
} from './submission-workflow-forms';
import { ConstructorManuscriptRow } from '@/components/constructor/ConstructorManuscriptRow';
import { ReviewManuscriptPresentationPicker } from '@/components/constructor/ReviewManuscriptPresentationPicker';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CircularProgress } from '@/components/ui/circular-progress';
import { constructorDraftHasMeaningfulContent } from '@/lib/constructor-import-merge';
import { resolveConstructorDocxFileName } from '@/lib/constructor-docx-filename';
import {
  type ReviewManuscriptPresentation,
  detectManuscriptSources,
  readReviewManuscriptPresentation,
  resolveDefaultReviewManuscriptPresentation,
  presentationIsValid,
  writeReviewManuscriptPresentation,
} from '@/lib/review-manuscript-presentation';
import {
  useInvalidateSubmissionDetail,
  usePatchSubmission,
} from '@/lib/queries/submissions';
import { CopyeditSection } from '@/components/copyedit/CopyeditSection';
import { SubmissionDisciplinePanel } from '@/components/submission-discipline-panel';
import { DisciplineBadges } from '@/components/discipline-badges';
import { CorpusSimilarityPanel } from '@/components/corpus-similarity-panel';
import { ReviewerSuggestionsPanel } from '@/components/reviewer-suggestions-panel';
import { SectionEditorSuggestionsPanel } from '@/components/section-editor-suggestions-panel';
import type { SectionEditorCandidate } from '@/lib/queries/submissions';
import type {
  ConstructorContent,
  ConstructorValidationError,
} from '@/lib/constructor-content.types';
import { submitSubmissionForReview } from '@/lib/constructor-manuscript';
import { stashConstructorSubmitErrors } from '@/lib/constructor-submit-errors';
import { editorStatusOptions } from '@/lib/editor-status-transitions';
import { isEditorDecisionStatus } from '@/lib/editor-decision-statuses';
import { submissionAllowsReviewConfiguration } from '@/lib/submission-review-phase';
import {
  apiCodeToFieldErrors,
  collectSubmitReadinessErrors,
  fileFieldKey,
  fileRowCls,
  hasFieldError,
  scrollToFirstFieldError,
  type SubmitReadinessContributor,
} from '@/lib/submission-field-errors';
import { SUBMISSION_API_ERROR_CODES } from '@/lib/submission-api-error-codes';
import { ManuscriptValidationPanel } from '@/components/manuscript-validation/ManuscriptValidationPanel';
import {
  PRE_SUBMIT_API_ERROR_CODES,
  PRE_SUBMIT_VALIDATION_FIELD,
} from '@/lib/pre-submit-validation';
import { usePreSubmitValidation } from '@/lib/use-pre-submit-validation';

type FileRow = SubmissionRecord['files'] extends Array<infer R> | undefined
  ? R
  : never;

type SubmissionDetail = SubmissionRecord;

type ReviewerCandidate = SubmissionDetailPayload['reviewerCandidates'][number];

type AssignmentRow = SubmissionDetailPayload['editorAssignmentRows'][number];

type ReminderAdminRow =
  SubmissionDetailPayload['assignmentReminders'][string][number];

function getFileIcon(kind: string) {
  if (kind === 'table') {
    return (
      <Table
        className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
        strokeWidth={2}
        aria-hidden
      />
    );
  }
  if (kind === 'figure') {
    return (
      <ImageIcon
        className="size-5 shrink-0 text-blue-600 dark:text-blue-400"
        strokeWidth={2}
        aria-hidden
      />
    );
  }
  if (kind === 'supplementary') {
    return (
      <Paperclip
        className="size-5 shrink-0 text-amber-600 dark:text-amber-400"
        strokeWidth={2}
        aria-hidden
      />
    );
  }
  return (
    <FileText
      className="size-5 shrink-0 text-accent/80 dark:text-accent/60"
      strokeWidth={2}
      aria-hidden
    />
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
  const stage = f.fileStage === 'review' ? 'review' : 'submission';
  const rowCls = softRows
    ? 'group flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/10 bg-paper/60 p-4 shadow-2xs hover:border-accent-2/20 hover:bg-paper/80 transition-all duration-200'
    : 'group flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 py-4 last:border-b-0 hover:bg-ink/[0.01] px-2 rounded-lg transition-colors';
  return (
    <li className={rowCls}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-xl bg-ink/5 dark:bg-white/5 transition-colors group-hover:bg-accent/5 dark:group-hover:bg-accent/10">
          {getFileIcon(f.kind || 'manuscript')}
        </div>
        <div className="min-w-0 flex-1 text-start">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-ink/8 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-ink/70 font-semibold">
              {tk(`fileKind_${f.kind || 'manuscript'}`)}
            </span>
            {showWorkflowStageBadge ? (
              <span className="rounded bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-accent font-semibold">
                {t(`fileStage_${stage}`)}
              </span>
            ) : null}
            {showPublicBadge && f.isPublic ? (
              <span className="rounded bg-emerald-100 dark:bg-emerald-950/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-emerald-900/90 dark:text-emerald-300 font-semibold">
                {t('filePublicBadge')}
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
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => onDownload(f)}
        >
          {t('download')}
        </Button>
        {editorCanTogglePackage && onTogglePackage ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onTogglePackage(f)}
            className="inline-flex items-center justify-center rounded-xl border border-accent/20 bg-accent/[0.04] px-3 py-1.5 text-xs font-semibold text-accent shadow-2xs hover:bg-accent/[0.08] active:scale-[0.98] transition-all duration-150 disabled:opacity-50"
          >
            {stage === 'review'
              ? t('toggleReviewPackageExclude')
              : t('toggleReviewPackageInclude')}
          </button>
        ) : null}
        {showRemove && (
          <Button
            variant="danger-soft"
            size="sm"
            disabled={busy}
            onClick={() => onRemove?.(f.id)}
            title={t('removeFile')}
          >
            × {t('removeFile')}
          </Button>
        )}
      </div>
    </li>
  );
}

function recommendationLabel(
  r: string,
  tCommon: (key: string) => string,
): string {
  switch (r) {
    case 'accept':
      return tCommon('recAccept');
    case 'reject':
      return tCommon('recReject');
    case 'revisions':
      return tCommon('recRevisions');
    case 'resubmit_for_review':
      return tCommon('recResubmitForReview');
    case 'resubmit_elsewhere':
      return tCommon('recResubmitElsewhere');
    case 'see_comments':
      return tCommon('recSeeComments');
    default:
      return tCommon('recRevisions');
  }
}

function parseInvalidStatusTransition(
  err: ApiError,
): { from: string; to: string } | null {
  if (err.code === 'INVALID_STATUS_TRANSITION') {
    const from = String(err.details?.fromStatus ?? '');
    const to = String(err.details?.toStatus ?? '');
    if (from && to) return { from, to };
  }
  const match = err.message.match(/^Cannot transition from (\S+) to (\S+)$/);
  if (match) return { from: match[1], to: match[2] };
  return null;
}

const REMINDER_MIN_LEAD_MS = 120_000;

function SubmissionDetailSkeleton() {
  const t = useTranslations('SubmissionDetail');
  return (
    <main className={PAGE_SHELL_NARROW} aria-busy="true">
      <SkeletonLoadingStatus label={t('loading')} />
      {/* Hero header card */}
      <div className="rounded-2xl border border-ink/10 p-6 sm:p-8 space-y-4">
        <Skeleton className="h-3 w-16" />
        <div className="mt-4 space-y-3">
          <div className="flex gap-2">
            <Skeleton className="h-5 w-20 rounded" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
          <Skeleton className="h-8 w-3/4 max-w-xl rounded-xl" />
          <Skeleton className="h-4 w-52" />
        </div>
      </div>

      {/* Two-column grid */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Main col */}
        <div className="lg:col-span-8 space-y-6">
          <div className="rounded-xl border border-ink/10 p-6 space-y-4">
            <Skeleton className="h-5 w-36 rounded-xl" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <div className="rounded-xl border border-ink/10 p-6 space-y-3">
            <Skeleton className="h-5 w-28 rounded-xl" />
            {[1, 2].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 py-3 border-b border-ink/[0.05]"
              >
                <Skeleton className="size-9 rounded-xl shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-8 w-20 rounded-xl" />
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <div className="rounded-2xl border border-ink/10 p-6 space-y-4">
            <Skeleton className="h-5 w-32 rounded-xl" />
            <Skeleton className="size-16 rounded-full mx-auto" />
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-5 rounded-full shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-36" />
                  <Skeleton className="h-2.5 w-24" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function SubmissionDetailPage() {
  const t = useTranslations('SubmissionDetail');
  const tManuscript = useTranslations('ConstructorManuscript');
  const tWf = useTranslations('SubmissionWorkflow');
  const tSub = useTranslations('Submissions');
  const tCommon = useTranslations('Common');
  const tUi = useTranslations('UI');
  const tAssign = useTranslations('Assignments');
  const tv = useTranslations('Validation');
  const locale = useLocale();
  const params = useParams();
  const slug = params.slug as string;
  const pathname = usePathname();
  const router = useRouter();
  const fileInputId = useId();
  const reviewMethodSelectId = useId();
  const invalidateDetail = useInvalidateSubmissionDetail();
  const patchSubmission = usePatchSubmission(slug);
  const { resolve: resolveApiError, codeMessages } = useApiErrorMessages();
  const tApi = useTranslations('ApiErrors');
  const showApiError = useToastApiError();
  const detailQuery = useSubmissionDetail(slug, true);
  const detail = detailQuery.data;
  const me = detail?.me ?? null;
  const sub = detail?.sub ?? null;
  const reviewerCandidates = detail?.reviewerCandidates ?? [];
  const sectionEditorCandidates: SectionEditorCandidate[] =
    detail?.sectionEditorCandidates ?? [];
  const reviewersLoadError = detail
    ? detail.reviewersLoadError === 'reviewers_load_failed'
      ? t('reviewersLoadFailed')
      : detail.reviewersLoadError
    : null;
  const editorReviews = detail?.editorReviews ?? [];
  const authorReviews = detail?.authorReviews ?? [];
  const reviewsError = detail?.reviewsLoadFailed
    ? t('reviewsLoadFailed')
    : null;
  const editorAssignmentRows = detail?.editorAssignmentRows ?? [];
  const assignmentReminders = detail?.assignmentReminders ?? {};
  const reminderLoadFailedByAssignment =
    detail?.reminderLoadFailedByAssignment ?? {};
  const canManageReminders = me
    ? canManageAssignmentReminders(me.permissions)
    : false;
  const loadError = detailQuery.isError
    ? resolveApiError(detailQuery.error, t('loadFailed'))
    : null;
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitFieldErrors, setSubmitFieldErrors] = useState<Set<string>>(
    () => new Set(),
  );

  const clearSubmitFieldError = useCallback((key: string) => {
    setSubmitFieldErrors((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);
  const [reviewerPick, setReviewerPick] = useState('');
  const [assignResponseDue, setAssignResponseDue] = useState('');
  const [assignReviewDue, setAssignReviewDue] = useState('');
  const [assignEditorInstructions, setAssignEditorInstructions] = useState('');
  const [sectionEditorPick, setSectionEditorPick] = useState('');
  const [statusPick, setStatusPick] = useState('');
  const [messageForAuthor, setMessageForAuthor] = useState('');
  const [authorResponseToReviewers, setAuthorResponseToReviewers] =
    useState('');
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
  const metadataFormRef = useRef<SubmissionMetadataFormHandle>(null);

  const serverStatus = sub?.status ?? '';
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
    toast.error(reviewersLoadError, { id: 'submission-reviewers-load' });
  }, [reviewersLoadError]);

  const toastedReviewsRef = useRef(false);
  useEffect(() => {
    if (!reviewsError) {
      toastedReviewsRef.current = false;
      return;
    }
    if (toastedReviewsRef.current) return;
    toastedReviewsRef.current = true;
    toast.error(reviewsError, { id: 'submission-reviews-load' });
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
      (fromServer && presentationIsValid(fromServer, sources)
        ? fromServer
        : null) ??
      stored ??
      resolveDefaultReviewManuscriptPresentation(sources);
    setReviewPresentation(next);
  }, [
    sub?.slug,
    sub?.updatedAt,
    sub?.constructorContent,
    sub?.files,
    sub?.reviewManuscriptPresentation,
  ]);

  const draftManuscriptSources = detectManuscriptSources({
    files: sub?.files ?? [],
    constructorContent: sub?.constructorContent,
  });

  const preSubmitValidation = usePreSubmitValidation({
    serverAnalysis: sub?.preSubmitAnalysis ?? null,
    serverUpdatedAt: sub?.updatedAt,
    constructorContent: sub?.constructorContent,
    hasConstructorDraft: draftManuscriptSources.hasConstructorDraft,
    reviewPresentation,
    busy,
    hasManuscript:
      draftManuscriptSources.hasUploadedManuscript ||
      draftManuscriptSources.hasConstructorDraft,
    t,
    onBlocked: (errors) => {
      setSubmitFieldErrors(errors);
      scrollToFirstFieldError(errors);
    },
  });

  async function uploadFile(f: File, kind: string) {
    if (!sub) return;
    setBusy(true);
    setUploadingName(f.name);
    setValidationError(null);
    if (fileExceedsUploadLimit(f)) {
      toast.error(tv('fileTooLarge', { maxMb: MAX_UPLOAD_MB }), {
        id: 'submission-file-too-large',
      });
      setBusy(false);
      setUploadingName(null);
      return;
    }
    try {
      await apiUpload(`/submissions/${encodeURIComponent(sub.slug)}/files`, f, {
        kind,
      });
      toast.success(t('uploadSuccess'), { id: 'submission-upload-success' });
      clearSubmitFieldError(fileFieldKey(kind));
      invalidateDetail(slug);
    } catch (err) {
      showApiError(err, t('uploadFailed'), { id: 'submission-upload' });
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
      const a = document.createElement('a');
      a.href = url;
      a.download = f.originalName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t('downloadFailed'), { id: 'submission-download' });
    } finally {
      setBusy(false);
    }
  }

  function requestRemoveSubmissionFile(fileId: string) {
    if (
      !sub ||
      (sub.status !== 'draft' && sub.status !== 'revisions_requested')
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
          method: 'DELETE',
        },
      );
      toast.success(t('fileRemovedSuccess'), {
        id: 'submission-delete-file-success',
      });
      invalidateDetail(slug);
    } catch (err) {
      showApiError(err, t('deleteFailed'), { id: 'submission-delete-file' });
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
      toast.success(t('constructorCleared'), {
        id: 'submission-constructor-clear-success',
      });
      invalidateDetail(slug);
    } catch (err) {
      showApiError(err, t('deleteFailed'), {
        id: 'submission-constructor-clear',
      });
    } finally {
      setBusy(false);
    }
  }

  async function submitForReview() {
    if (!sub) return;
    setBusy(true);
    setValidationError(null);
    setSubmitFieldErrors(new Set());
    try {
      const saved = await metadataFormRef.current?.save({ silent: true });
      if (saved === false) {
        return;
      }

      const enc = encodeURIComponent(sub.slug);
      const fresh = await apiJson<SubmissionDetail>(`/submissions/${enc}`);
      const cc = fresh.constructorContent as
        | ConstructorContent
        | null
        | undefined;
      const sources = detectManuscriptSources({
        files: fresh.files,
        constructorContent: cc,
      });
      if (!presentationIsValid(reviewPresentation, sources)) {
        const presentationErrors = new Set<string>(['presentation']);
        setSubmitFieldErrors(presentationErrors);
        toast.error(tManuscript('presentationAtLeastOne'), {
          id: 'submission-presentation-required',
        });
        scrollToFirstFieldError(presentationErrors);
        return;
      }

      const readiness = collectSubmitReadinessErrors({
        submission: {
          articleType: fresh.articleType,
          titleAr: fresh.titleAr,
          abstract: fresh.abstract,
          abstractAr: fresh.abstractAr,
          keywords: fresh.keywords,
          keywordsAr: fresh.keywordsAr,
          contributors: fresh.contributors as
            | SubmitReadinessContributor[]
            | null,
          originalityConfirmed: fresh.originalityConfirmed,
          conflictOfInterestStatement: fresh.conflictOfInterestStatement,
          ethicalApprovalReference: fresh.ethicalApprovalReference,
          aiUsageStatement: fresh.aiUsageStatement,
        },
        files: fresh.files ?? [],
        presentation: reviewPresentation,
        manuscriptSources: sources,
        codeMessages,
      });
      if (readiness.errors.size > 0) {
        setSubmitFieldErrors(readiness.errors);
        if (readiness.message) {
          toast.error(readiness.message, {
            id: 'submission-submit-validation',
          });
        }
        scrollToFirstFieldError(readiness.errors);
        return;
      }

      const preSubmitState = await preSubmitValidation.assertReadyBeforeSubmit({
        analysis: fresh.preSubmitAnalysis ?? null,
        constructorContent: cc,
      });
      if (preSubmitState !== 'ready') {
        const validationErrors = new Set<string>([PRE_SUBMIT_VALIDATION_FIELD]);
        setSubmitFieldErrors(validationErrors);
        scrollToFirstFieldError(validationErrors);
        preSubmitValidation.toastForSubmitState(preSubmitState);
        return;
      }

      await submitSubmissionForReview(sub.slug, {
        presentUploadedManuscript: reviewPresentation.presentUploaded,
        presentConstructorManuscript: reviewPresentation.presentConstructor,
        constructorContent:
          reviewPresentation.presentConstructor && sources.hasConstructorDraft
            ? cc
            : null,
        authorResponseToReviewers:
          sub.status === 'revisions_requested'
            ? authorResponseToReviewers
            : undefined,
      });
      toast.success(t('submitSuccess'), { id: 'submission-submit-success' });
      setSubmitFieldErrors(new Set());
      setAuthorResponseToReviewers('');
      invalidateDetail(slug);
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.code === 'CONSTRUCTOR_VALIDATION_FAILED' &&
        Array.isArray(err.details?.errors)
      ) {
        stashConstructorSubmitErrors(
          err.details.errors as ConstructorValidationError[],
        );
        router.push(`/submissions/${encodeURIComponent(sub.slug)}/compose`);
        return;
      }
      if (err instanceof ApiError && err.code === 'DOCX_FORMAT_VIOLATIONS') {
        const violationCount = Array.isArray(err.details?.violations)
          ? (err.details.violations as unknown[]).length
          : 1;
        const manuscriptFieldErrors = new Set([fileFieldKey('manuscript')]);
        setSubmitFieldErrors(manuscriptFieldErrors);
        scrollToFirstFieldError(manuscriptFieldErrors);
        toast.error(
          t('docxViolationsSubmitBlocked', { count: violationCount }),
          {
            id: 'submission-docx-violations',
          },
        );
        return;
      }
      if (
        err instanceof ApiError &&
        err.code &&
        ((SUBMISSION_API_ERROR_CODES as readonly string[]).includes(err.code) ||
          (PRE_SUBMIT_API_ERROR_CODES as readonly string[]).includes(err.code))
      ) {
        const fileKinds = new Set(
          (sub.files ?? []).map((f) => f.kind).filter(Boolean) as string[],
        );
        const apiErrors = apiCodeToFieldErrors(err.code, {
          presentation: reviewPresentation,
          fileKinds,
          contributors:
            (sub.contributors as SubmitReadinessContributor[]) ?? [],
        });
        setSubmitFieldErrors(apiErrors);
        scrollToFirstFieldError(apiErrors);
        showApiError(err, t('submitFailed'), { id: 'submission-submit' });
        return;
      }
      showApiError(err, t('submitFailed'), { id: 'submission-submit' });
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
      const body: Record<string, string> = { ...parsed.data };
      if (assignResponseDue) body.responseDueAt = assignResponseDue;
      if (assignReviewDue) body.reviewDueAt = assignReviewDue;
      if (assignEditorInstructions.trim())
        body.editorInstructions = assignEditorInstructions.trim();
      await apiJson(
        `/submissions/${encodeURIComponent(sub.slug)}/assignments`,
        {
          method: 'POST',
          headers: { 'X-Folio-Locale': locale },
          body: JSON.stringify(body),
        },
      );
      toast.success(t('assignSuccess'), { id: 'submission-assign-success' });
      setReviewerPick('');
      setAssignResponseDue('');
      setAssignReviewDue('');
      setAssignEditorInstructions('');
      invalidateDetail(slug);
    } catch (err) {
      showApiError(err, t('assignFailed'), { id: 'submission-assign' });
    } finally {
      setBusy(false);
    }
  }

  async function assignSectionEditor() {
    if (!sub || !sectionEditorPick.trim()) return;
    setBusy(true);
    try {
      await apiJson(
        `/submissions/${encodeURIComponent(sub.slug)}/section-editor-assignment`,
        {
          method: 'POST',
          headers: { 'X-Folio-Locale': locale },
          body: JSON.stringify({ sectionEditorId: sectionEditorPick }),
        },
      );
      toast.success(t('sectionEditorAssignSuccess'), {
        id: 'se-assign-success',
      });
      setSectionEditorPick('');
      invalidateDetail(slug);
    } catch (err) {
      showApiError(err, t('sectionEditorAssignFailed'), { id: 'se-assign' });
    } finally {
      setBusy(false);
    }
  }

  async function removeSectionEditorAssignment() {
    if (!sub) return;
    setBusy(true);
    try {
      await apiJson(
        `/submissions/${encodeURIComponent(sub.slug)}/section-editor-assignment`,
        { method: 'DELETE' },
      );
      toast.success(t('sectionEditorUnassignSuccess'), {
        id: 'se-unassign-success',
      });
      invalidateDetail(slug);
    } catch (err) {
      showApiError(err, t('sectionEditorUnassignFailed'), {
        id: 'se-unassign',
      });
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus() {
    if (!sub) return;
    const body: {
      status: string;
      messageForAuthor?: string;
    } = { status: statusPick };
    const trimmedMessage = messageForAuthor.trim();
    if (isEditorDecisionStatus(statusPick) && trimmedMessage) {
      body.messageForAuthor = trimmedMessage;
    }
    const parsed = safeParseResult(updateSubmissionStatusSchema, body);
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
        method: 'PATCH',
        headers: { 'X-Folio-Locale': locale },
        body: JSON.stringify(parsed.data),
      });
      toast.success(t('statusUpdated'));
      setMessageForAuthor('');
      invalidateDetail(slug);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'REVIEW_PACKAGE_INCOMPLETE') {
        toast.error(t('reviewPackageIncomplete'), { id: 'submission-status' });
        return;
      }
      if (err instanceof ApiError) {
        const transition = parseInvalidStatusTransition(err);
        if (transition) {
          toast.error(
            t('invalidStatusTransition', {
              from: submissionStatusLabel(transition.from, tSub),
              to: submissionStatusLabel(transition.to, tSub),
            }),
            { id: 'submission-status' },
          );
          return;
        }
      }
      showApiError(err, t('statusFailed'), { id: 'submission-status' });
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
      toast.error(t('reminderRescheduleRequired'), { id: toastId });
      return;
    }
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) {
      toast.error(t('reminderRescheduleRequired'), { id: toastId });
      return;
    }
    if (d.getTime() <= Date.now() + REMINDER_MIN_LEAD_MS) {
      toast.error(t('reminderSendAtTooSoon'), { id: toastId });
      return;
    }
    setBusy(true);
    setValidationError(null);
    try {
      const enc = encodeURIComponent(sub.slug);
      await apiJson(
        `/submissions/${enc}/assignments/${encodeURIComponent(assignmentSlug)}/reminders/${reminderId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ sendAt: d.toISOString() }),
        },
      );
      toast.success(t('reminderRescheduled'));
      setReminderRescheduleAt((prev) => {
        const next = { ...prev };
        delete next[reminderId];
        return next;
      });
      invalidateDetail(slug);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'REMINDER_SEND_AT_TOO_SOON') {
        toast.error(t('reminderSendAtTooSoon'), { id: toastId });
        return;
      }
      if (err instanceof ApiError && err.code === 'EMAIL_DB_FORBIDDEN') {
        toast.error(err.message, { id: toastId });
        return;
      }
      showApiError(err, t('reminderRescheduleFailed'), { id: toastId });
    } finally {
      setBusy(false);
    }
  }

  async function cancelReminderRow(assignmentSlug: string, reminderId: string) {
    if (!sub) return;
    setBusy(true);
    setValidationError(null);
    const toastId = `submission-reminder-cancel-${reminderId}`;
    try {
      const enc = encodeURIComponent(sub.slug);
      await apiJson(
        `/submissions/${enc}/assignments/${encodeURIComponent(assignmentSlug)}/reminders/${reminderId}/cancel`,
        { method: 'POST' },
      );
      toast.success(t('reminderCancelled'));
      invalidateDetail(slug);
    } catch (err) {
      showApiError(err, t('reminderCancelFailed'), { id: toastId });
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
          method: 'PATCH',
          body: JSON.stringify({ reviewMethod: nextMethod }),
        },
      );
      toast.success(t('reviewMethodUpdated'), {
        id: 'submission-review-method',
      });
      invalidateDetail(slug);
    } catch (err) {
      showApiError(err, t('reviewMethodFailed'), {
        id: 'submission-review-method',
      });
    } finally {
      setBusy(false);
    }
  }

  async function patchFileReviewStage(f: FileRow) {
    if (!sub) return;
    if (!submissionAllowsReviewConfiguration(sub.status)) return;
    const next = f.fileStage === 'review' ? 'submission' : 'review';
    setBusy(true);
    setValidationError(null);
    try {
      await apiJson(
        `/submissions/${encodeURIComponent(sub.slug)}/files/${f.id}/stage`,
        {
          method: 'PATCH',
          body: JSON.stringify({ fileStage: next }),
        },
      );
      toast.success(t('fileStageUpdated'), { id: 'submission-file-stage' });
      invalidateDetail(slug);
    } catch (err) {
      showApiError(err, t('fileStageFailed'), { id: 'submission-file-stage' });
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
          detailQuery.error &&
          getApiErrorKind(detailQuery.error) === 'rateLimit'
            ? tApi('rateLimitHint')
            : undefined
        }
        onRetry={() => void detailQuery.refetch()}
        retryLabel={tApi('retry')}
        backHref="/submissions"
        backLabel={tSub('title')}
      />
    );
  }

  if (detailQuery.isPending || !sub || !me) {
    return <SubmissionDetailSkeleton />;
  }

  const isAuthor =
    sub.authorId != null && sub.authorId !== '' && sub.authorId === me.id;
  const canManageOwn = canManageOwnSubmissions(me.permissions);
  const isEditorView = detail!.isEditorView;
  const showCorpusSimilarity =
    !isAuthor && (isEditorView || sub.status !== 'draft');
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
  const isPublishedSubmission = sub.status === 'published';
  const canAssignReviewer =
    isEditorView &&
    me.permissions.includes(PERMISSION_SLUGS.SUBMISSION_ASSIGN_REVIEWER) &&
    canConfigureReviewForStatus;
  const canAssignSectionEditor =
    isEditorView &&
    me.permissions.includes(PERMISSION_SLUGS.SUBMISSION_ASSIGN_SECTION_EDITOR);
  const canEditManuscript =
    canManageOwn &&
    isAuthor &&
    (sub.status === 'draft' ||
      sub.status === 'revisions_requested' ||
      sub.status === 'copyediting');
  const canRemoveFiles =
    canManageOwn &&
    isAuthor &&
    (sub.status === 'draft' || sub.status === 'revisions_requested');
  const showMetadataForm =
    canManageOwn &&
    isAuthor &&
    !isEditorView &&
    (sub.status === 'draft' || sub.status === 'revisions_requested');
  const showMetadataReadonly = isEditorView || (isAuthor && !showMetadataForm);
  const showAbstractSection = !showMetadataForm;

  const metadataFormInitial = {
    title: sub.title,
    titleAr: sub.titleAr ?? '',
    abstract: sub.abstract,
    abstractAr: sub.abstractAr ?? '',
    articleType: sub.articleType ?? null,
    keywords: sub.keywords ?? null,
    keywordsAr: sub.keywordsAr ?? null,
    contributors: (sub.contributors as ContributorRow[] | null) ?? null,
    fundingStatement: sub.fundingStatement ?? null,
    conflictOfInterestStatement: sub.conflictOfInterestStatement ?? null,
    ethicalApprovalReference: sub.ethicalApprovalReference ?? null,
    originalityConfirmed: sub.originalityConfirmed === true,
    aiUsageStatement: sub.aiUsageStatement ?? null,
    disciplines: sub.disciplines ?? [],
    disciplineSource: sub.disciplineSource ?? null,
    disciplineSuggestedLabels: sub.disciplineSuggestedLabels ?? [],
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
    conflictOfInterestStatement:
      metadataFormInitial.conflictOfInterestStatement,
    ethicalApprovalReference: metadataFormInitial.ethicalApprovalReference,
    originalityConfirmed: metadataFormInitial.originalityConfirmed,
    aiUsageStatement: metadataFormInitial.aiUsageStatement,
    ...(isEditorView
      ? {}
      : {
          disciplines: metadataFormInitial.disciplines,
          disciplineSource: metadataFormInitial.disciplineSource,
          disciplineSuggestedLabels:
            metadataFormInitial.disciplineSuggestedLabels,
          disciplineSuggestedConfidence:
            metadataFormInitial.disciplineSuggestedConfidence,
          disciplineScopeInJournal:
            metadataFormInitial.disciplineScopeInJournal,
          disciplineScopeWarning: metadataFormInitial.disciplineScopeWarning,
        }),
  };
  const files = sub.files ?? [];
  const constructorContent = sub.constructorContent as
    | ConstructorContent
    | null
    | undefined;
  const { hasUploadedManuscript, hasConstructorDraft } =
    detectManuscriptSources({ files, constructorContent });
  const constructorManuscriptFiles = files.filter(
    (f) => f.kind === 'manuscript_constructor',
  );
  const attachedConstructorFile = constructorManuscriptFiles[0];
  const canEditConstructor =
    canManageOwn &&
    isAuthor &&
    (sub.status === 'draft' || sub.status === 'revisions_requested');
  const constructorDisplayName = hasConstructorDraft
    ? (attachedConstructorFile?.originalName ??
      resolveConstructorDocxFileName(constructorContent))
    : '';
  const constructorStatusHint = hasConstructorDraft
    ? attachedConstructorFile
      ? ('attached' as const)
      : ('pending' as const)
    : undefined;
  const composeHref = `/submissions/${encodeURIComponent(sub.slug)}/compose`;
  const editableFileKinds = fileKindsForSubmissionDetail();
  const showReadonlyFiles = !canEditManuscript && files.length > 0;

  const {
    preSubmitAnalysis,
    setPreSubmitAnalysis,
    validatingManuscript,
    setValidatingManuscript,
    preSubmitState,
    submitDisabled,
    submitButtonLabel,
    handleSubmitClick,
  } = preSubmitValidation;
  const effectiveSubmitButtonLabel =
    sub.status === 'revisions_requested' &&
    (preSubmitState === 'ready' || preSubmitState === 'not_required')
      ? t('resubmitBannerCta')
      : submitButtonLabel;

  const mainShellCls = isEditorView
    ? submissionQueueShellCls
    : PAGE_SHELL_NARROW;
  const cardRounded = isEditorView ? 'rounded-xl' : 'rounded-lg';
  const contentPad = isEditorView ? 'p-6 sm:p-8' : 'p-6';

  const statuses = editorStatusOptions(sub.status);

  const statusLabel = submissionStatusLabel(sub.status, tSub);
  const tWfAny = tWf as unknown as (k: string) => string;

  // Checklist Calculations
  const hasTitle = sub.title?.trim().length > 0;
  const hasAbstract = sub.abstract?.trim().length > 0;
  const hasManuscript = hasUploadedManuscript || hasConstructorDraft;
  const hasDiscipline = (sub.disciplines?.length ?? 0) > 0;

  let completedSteps = 0;
  const totalSteps = 4;
  if (hasTitle) completedSteps++;
  if (hasAbstract) completedSteps++;
  if (hasManuscript) completedSteps++;
  if (hasDiscipline) completedSteps++;

  const progressPercent = Math.round((completedSteps / totalSteps) * 100);

  return (
    <main className={mainShellCls}>
      <ConfirmDialog
        open={pendingRemoveFileId != null}
        onOpenChange={(open) => {
          if (!open) setPendingRemoveFileId(null);
        }}
        title={t('removeFile')}
        description={t('removeFileConfirm')}
        cancelLabel={tManuscript('cancel')}
        confirmLabel={t('removeFile')}
        onConfirm={() => void confirmRemoveSubmissionFile()}
        confirmDisabled={busy}
      />
      <ConfirmDialog
        open={clearConstructorOpen}
        onOpenChange={setClearConstructorOpen}
        title={tManuscript('clearConstructorTitle')}
        description={tManuscript('clearConstructorDescription')}
        cancelLabel={tManuscript('cancel')}
        confirmLabel={tManuscript('clearConstructorConfirm')}
        onConfirm={() => void confirmClearConstructorDraft()}
        confirmDisabled={busy}
      />

      {/* Premium Glassmorphic Workspace Hero Header */}
      <header className="relative overflow-hidden rounded-2xl border border-ink/10 dark:border-white/10 bg-surface/60 dark:bg-white/5 backdrop-blur-md p-6 sm:p-8 shadow-xs hover:border-accent/15 transition-all duration-300">
        <div className="absolute -right-20 -top-20 size-48 rounded-full bg-accent/5 blur-3xl" />
        <div className="absolute -left-20 -bottom-20 size-48 rounded-full bg-accent-2/5 blur-3xl" />

        {isEditorView ? (
          <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-ink/60">
            <Link
              href="/submissions"
              className="text-accent hover:text-accent/80 transition-colors"
            >
              {t('back')}
            </Link>
            <span className="text-ink/20" aria-hidden>
              ·
            </span>
            <Link
              href="/editor"
              className="hover:text-accent transition-colors"
            >
              {t('backToEditorQueue')}
            </Link>
          </nav>
        ) : (
          <nav className="text-xs font-medium">
            <Link
              href="/submissions"
              className="text-accent hover:text-accent/80 transition-colors"
            >
              {t('back')}
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
              aria-label={t('dismissError')}
            >
              ×
            </button>
          </div>
        )}

        <div className="mt-6 flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-accent/8 dark:bg-accent/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent font-semibold">
                {sub.articleType
                  ? tWfAny(`articleType_${sub.articleType}`)
                  : t('manuscriptBadge')}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold shadow-2xs ${
                  sub.status === 'draft'
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                    : sub.status === 'under_review'
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                      : sub.status === 'accepted' || sub.status === 'published'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                        : 'bg-ink/5 text-ink/70 dark:bg-white/10 dark:text-white/70'
                }`}
              >
                {sub.status === 'draft' && (
                  <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                )}
                {sub.status === 'under_review' && (
                  <span className="size-1.5 rounded-full bg-blue-500 animate-pulse" />
                )}
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
                {t('lastUpdated')}{' '}
                <span className="font-medium text-ink/70 dark:text-white/60">
                  {new Date(sub.updatedAt).toLocaleDateString(locale, {
                    dateStyle: 'medium',
                  })}
                </span>
              </span>
              <span className="hidden sm:inline" aria-hidden>
                •
              </span>
              <span>
                {t('submissionId')}{' '}
                <span className="font-mono bg-ink/5 dark:bg-white/5 px-1.5 py-0.5 rounded">
                  {sub.slug}
                </span>
              </span>
            </div>
          </div>
        </div>

        {sub.reviewMethod === 'double_anonymous' ? (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200/40 bg-amber-500/[0.04] px-4 py-3 text-xs text-amber-800 dark:text-amber-400">
            <TriangleAlert
              className="size-5 shrink-0 text-amber-500 mt-0.5"
              strokeWidth={2}
              aria-hidden
            />
            <p className="leading-relaxed">{t('doubleBlindAuthorNotice')}</p>
          </div>
        ) : null}
      </header>

      {/* Dual Column Layout Grid */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (Main Workspace) */}
        <div className="lg:col-span-8 space-y-6">
          {showMetadataReadonly && (
            <section
              className={`${cardRounded} border border-ink/10 dark:border-white/10 bg-surface shadow-xs ${contentPad} hover:border-accent/15 transition-colors duration-300`}
            >
              <h2 className="font-serif text-lg font-semibold text-ink">
                {tWf('metadataReadonlyTitle')}
              </h2>
              <p className="mt-1 text-xs text-ink/65">
                {tWf('metadataReadonlyHint')}
              </p>
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
              className={`${cardRounded} border border-ink/10 dark:border-white/10 bg-surface shadow-xs ${contentPad}`}
            >
              <h2 className="font-serif text-lg font-semibold text-ink">
                {tWf('metadataEditTitle')}
              </h2>
              <p className="mt-1 text-xs text-ink/65">
                {tWf('metadataEditHint')}
              </p>
              <div className="mt-6">
                <SubmissionMetadataForm
                  ref={metadataFormRef}
                  key={sub.updatedAt}
                  slug={sub.slug}
                  canEdit
                  initial={metadataFormInitial}
                  fieldErrors={submitFieldErrors}
                  clearFieldError={clearSubmitFieldError}
                  onFieldErrorsChange={setSubmitFieldErrors}
                  onSaved={() => invalidateDetail(slug)}
                  onDisciplineUpdated={() => invalidateDetail(slug)}
                  onError={(msg) => {
                    if (msg.trim())
                      toast.error(msg, { id: 'submission-metadata-form' });
                  }}
                />
              </div>
            </section>
          )}

          {showAbstractSection && (
            <section
              className={`${cardRounded} border border-ink/10 dark:border-white/10 bg-surface shadow-xs ${contentPad} hover:border-accent/15 transition-colors duration-300`}
            >
              <h2 className="font-serif text-lg font-semibold text-ink">
                {t('abstractsSection')}
              </h2>
              <div className="mt-4 space-y-6">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ink/40">
                    {tWf('abstractLabelEn')}
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
                      {tWf('abstractLabelAr')}
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
            <section
              className={`space-y-6 ${cardRounded} border border-ink/10 dark:border-white/10 bg-surface shadow-xs ${contentPad}`}
            >
              <div>
                <h2 className="font-serif text-lg font-semibold text-ink">
                  {t('manuscript')}
                </h2>
                <p className="mt-1 text-xs text-ink/75">
                  {t('uploadSubtitle')}
                </p>
                {canEditConstructor ? (
                  <p className="mt-2 text-xs text-ink/60">
                    {tManuscript('dualPathHint')}
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
                    {tManuscript('openConstructor')}
                  </Link>
                </div>
              )}

              <div className="space-y-5">
                {editableFileKinds.map(({ kind, required }) => (
                  <div
                    key={kind}
                    data-field-error={fileFieldKey(kind)}
                    className={fileRowCls(
                      hasFieldError(submitFieldErrors, fileFieldKey(kind)),
                      'rounded-xl bg-paper/40 px-4 py-3',
                    )}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-ink">
                        {tWfAny(`fileKind_${kind}`)}
                        {required ? (
                          <span className="ms-1.5 text-[10px] font-bold text-red-700 bg-red-50 dark:bg-red-950/20 px-1.5 py-0.5 rounded uppercase tracking-wider">
                            {tWf('requiredBadge')}
                          </span>
                        ) : (
                          <span className="ms-1.5 text-[10px] font-semibold text-ink/50 bg-ink/5 dark:bg-white/5 px-1.5 py-0.5 rounded uppercase tracking-wider">
                            {tWf('optionalBadge')}
                          </span>
                        )}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink/55 leading-relaxed">
                      {tWfAny(`fileKindHint_${kind}`)}
                    </p>
                    {kind === 'manuscript' && hasConstructorDraft ? (
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
                    <FileDropZone
                      inputId={`${fileInputId}-${kind}`}
                      accept={
                        kind === 'figure' || kind === 'table'
                          ? ACCEPT_FIGURE
                          : kind === 'supplementary'
                            ? ACCEPT_SUPPLEMENTARY
                            : ACCEPT_MANUSCRIPT
                      }
                      disabled={busy}
                      uploading={!!uploadingName}
                      onFile={(file) => void uploadFile(file, kind)}
                      ariaLabel={t('chooseFile')}
                      className="mt-3 border-0 p-0"
                    >
                      <div className="flex flex-wrap items-center gap-3 py-1">
                        <label
                          htmlFor={`${fileInputId}-${kind}`}
                          className={`inline-flex cursor-pointer rounded-xl border border-ink/20 dark:border-white/20 bg-paper px-4 py-2 text-xs font-semibold text-ink shadow-2xs hover:border-accent/40 hover:bg-ink/[0.02] active:scale-[0.98] select-none transition-all duration-150 ${busy ? 'pointer-events-none opacity-50' : ''}`}
                        >
                          {t('chooseFile')}
                        </label>
                      </div>
                    </FileDropZone>
                    {kind === 'manuscript' &&
                    sub.docxManuscriptViolations &&
                    sub.docxManuscriptViolations.length > 0 ? (
                      <div className="mt-3 rounded-xl border border-amber-400/60 bg-amber-50/70 dark:bg-amber-950/20 dark:border-amber-500/30 px-4 py-3">
                        <div className="flex items-start gap-2">
                          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                              {t('docxViolationsHeading')}
                            </p>
                            <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400/80">
                              {t('docxViolationsBody')}
                            </p>
                            <ul className="mt-2 space-y-1">
                              {sub.docxManuscriptViolations.map((v) => (
                                <li
                                  key={v.code}
                                  className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5"
                                >
                                  <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-amber-500 dark:bg-amber-400" />
                                  {locale === 'ar' ? v.messageAr : v.message}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    ) : null}
                    {kind === 'manuscript' &&
                    sub.docxGrammarNotes &&
                    sub.docxGrammarNotes.length > 0 ? (
                      <div className="mt-3 rounded-xl border border-blue-300/60 bg-blue-50/70 dark:bg-blue-950/20 dark:border-blue-500/30 px-4 py-3">
                        <div className="flex items-start gap-2">
                          <svg
                            className="mt-0.5 size-4 shrink-0 text-blue-600 dark:text-blue-400"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path
                              fillRule="evenodd"
                              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
                              clipRule="evenodd"
                            />
                          </svg>
                          <div className="min-w-0 w-full">
                            <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                              {t('docxGrammarHeading')}
                            </p>
                            <p className="mt-0.5 text-xs text-blue-700 dark:text-blue-400/80">
                              {t('docxGrammarBody')}
                            </p>
                            <ul className="mt-2 divide-y divide-blue-200/50 dark:divide-blue-700/30">
                              {sub.docxGrammarNotes.map((n, i) => (
                                <li
                                  key={i}
                                  className="py-2 first:pt-0 last:pb-0"
                                >
                                  <p className="text-xs text-blue-800 dark:text-blue-300">
                                    <span className="font-medium">
                                      {t('docxGrammarExcerpt')}:{' '}
                                    </span>
                                    <span className="font-mono bg-blue-100 dark:bg-blue-900/40 px-1 rounded">
                                      &ldquo;{n.excerpt}&rdquo;
                                    </span>
                                  </p>
                                  <p className="mt-0.5 text-xs text-blue-700 dark:text-blue-400">
                                    <span className="font-medium">
                                      {t('docxGrammarSuggestion')}:{' '}
                                    </span>
                                    {n.suggestion}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    ) : null}
                    {kind === 'manuscript' && canEditConstructor ? (
                      <div
                        className={`mt-4 pt-4 border-t border-ink/[0.05] dark:border-white/[0.05] ${
                          hasFieldError(submitFieldErrors, 'presentation')
                            ? 'rounded-lg border border-red-400 p-3 ring-1 ring-red-500/15'
                            : ''
                        }`}
                        data-field-error="presentation"
                      >
                        <ReviewManuscriptPresentationPicker
                          value={reviewPresentation}
                          onChange={(next) => {
                            setReviewPresentation(next);
                            writeReviewManuscriptPresentation(sub.slug, next);
                            clearSubmitFieldError('presentation');
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
                  <span className="sr-only">{t('uploading')}</span>
                </p>
              )}
              <p className="text-xs text-ink/55">{t('uploadHint')}</p>
              {canEditConstructor && hasConstructorDraft ? (
                <div className="pt-2">
                  <ManuscriptValidationPanel
                    slug={sub.slug}
                    constructorContent={constructorContent}
                    analysis={preSubmitAnalysis}
                    onAnalysisChange={(next) => {
                      setPreSubmitAnalysis(next);
                      invalidateDetail(slug);
                    }}
                    validating={validatingManuscript}
                    onValidatingChange={setValidatingManuscript}
                  />
                </div>
              ) : null}
              {files.length > 0 && (
                <div className="pt-4 border-t border-ink/[0.05] dark:border-white/[0.05]">
                  <h3 className="text-sm font-semibold text-ink mb-3">
                    {t('yourFiles')}
                  </h3>
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
                        onRemove={(fileId) =>
                          requestRemoveSubmissionFile(fileId)
                        }
                      />
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {showReadonlyFiles && (
            <section
              className={`${cardRounded} border border-ink/10 dark:border-white/10 bg-surface shadow-xs ${contentPad}`}
            >
              <h2 className="font-serif text-lg font-semibold text-ink">
                {t('attachedFiles')}
              </h2>
              {isEditorView && isPublishedSubmission && (
                <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-ink/70">
                  {t('attachedFilesPublishedHint')}
                </p>
              )}
              <ul
                className={
                  isEditorView
                    ? 'mt-4 space-y-3'
                    : 'mt-2 divide-y divide-ink/[0.05] dark:divide-white/[0.05]'
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
                {t('editorPanelTitle')}
              </h2>
              <p className="max-w-2xl text-sm leading-relaxed text-ink/70">
                {t('editorPanelHint')}
              </p>
              <div className="pt-2">
                <SubmissionDisciplinePanel
                  slug={sub.slug}
                  mode="editor"
                  canEdit={false}
                  fields={{
                    disciplines: sub.disciplines ?? [],
                    disciplineSource: sub.disciplineSource ?? null,
                    disciplineSuggestedLabels:
                      sub.disciplineSuggestedLabels ?? [],
                    disciplineSuggestedConfidence:
                      sub.disciplineSuggestedConfidence ?? null,
                    disciplineScopeInJournal:
                      sub.disciplineScopeInJournal ?? null,
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

          {isEditorView && sub.authorResponseToReviewers?.trim() && (
            <section
              className={`${cardRounded} border border-ink/10 dark:border-white/10 bg-surface shadow-xs ${contentPad}`}
            >
              <h2 className="font-serif text-lg font-semibold text-ink">
                {t('resubmitResponseLabel')}
              </h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink/80">
                {sub.authorResponseToReviewers}
              </p>
            </section>
          )}

          {isEditorView && (
            <section
              className={`${cardRounded} border border-ink/10 dark:border-white/10 bg-surface shadow-xs ${contentPad}`}
            >
              <h2 className="font-serif text-lg font-semibold text-ink">
                {t('reviewsSectionEditor')}
              </h2>
              <div className="mt-4">
                <ReviewConsensusPanel
                  assignments={editorAssignmentRows}
                  reviews={editorReviews}
                />
              </div>
              {reviewsError && (
                <p className="mt-3 text-sm text-red-700">{reviewsError}</p>
              )}
              {!reviewsError && editorReviews.length === 0 && (
                <p className="mt-3 text-sm text-ink/65">{t('reviewsEmpty')}</p>
              )}
              {!reviewsError && editorReviews.length > 0 && (
                <ul className="mt-4 space-y-6">
                  {editorReviews.map((r) => {
                    const name =
                      r.assignment?.reviewer?.displayName?.trim() ||
                      r.assignment?.reviewer?.email?.trim();
                    const reviewerLine = name
                      ? t('reviewFrom', { name })
                      : t('reviewReviewerUnknown');
                    const submitted = new Date(r.submittedAt).toLocaleString(
                      locale,
                      {
                        dateStyle: 'medium',
                        timeStyle: 'short',
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
                          {t('reviewSubmitted')}: {submitted}
                        </p>
                        <p className="mt-4 text-sm font-bold text-ink">
                          {t('reviewRecommendation')}:{' '}
                          <span className="text-accent">
                            {recommendationLabel(r.recommendation, tCommon)}
                          </span>
                        </p>
                        <div className="mt-4">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-ink/40">
                            {t('reviewForAuthor')}
                          </h3>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/80 font-sans">
                            {r.commentsForAuthor}
                          </p>
                        </div>
                        <div className="mt-4 border-t border-ink/10 dark:border-white/10 pt-4">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-ink/40">
                            {t('reviewForEditorOnly')}
                          </h3>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/80 font-sans">
                            {r.commentsToEditorOnly?.trim()
                              ? r.commentsToEditorOnly
                              : t('reviewNoEditorComments')}
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
            <section
              className={`${cardRounded} border border-ink/10 dark:border-white/10 bg-surface shadow-xs ${contentPad}`}
            >
              <h2 className="font-serif text-lg font-semibold text-ink">
                {t('reviewsSectionAuthor')}
              </h2>
              {reviewsError && (
                <p className="mt-3 text-sm text-red-700">{reviewsError}</p>
              )}
              <ul className="mt-4 space-y-5">
                {authorReviews.map((r, idx) => {
                  const submitted = new Date(r.submittedAt).toLocaleString(
                    locale,
                    {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    },
                  );
                  return (
                    <li
                      key={r.id}
                      className="rounded-xl border border-ink/10 dark:border-white/10 bg-paper/50 p-4 sm:p-5"
                    >
                      <p className="text-sm font-bold text-ink">
                        {t('reviewFeedbackItem', { n: idx + 1 })}
                      </p>
                      <p className="mt-1 text-xs text-ink/50">
                        {t('reviewSubmitted')}: {submitted}
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
          {isAuthor &&
            !isEditorView &&
            (sub.status === 'draft' ||
              sub.status === 'revisions_requested') && (
              <div className="rounded-2xl border border-ink/10 dark:border-white/10 bg-surface p-6 shadow-xs space-y-6 relative overflow-hidden">
                <div className="absolute -right-16 -top-16 size-36 rounded-full bg-accent/5 blur-2xl" />

                <div className="flex items-center justify-between border-b border-ink/[0.06] dark:border-white/[0.06] pb-3">
                  <h3 className="font-serif text-base font-semibold text-ink">
                    {t('readinessTitle')}
                  </h3>
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent uppercase tracking-wider">
                    {progressPercent}%
                  </span>
                </div>

                {/* Circular Progress and stats */}
                <div className="flex items-center gap-4">
                  <CircularProgress value={progressPercent} size={64} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-xs font-semibold text-ink">
                      {t('readinessRequirements')}
                    </p>
                    <p className="text-[11px] text-ink/50 leading-relaxed">
                      {t('readinessProgress', {
                        completed: completedSteps,
                        total: totalSteps,
                      })}
                    </p>
                  </div>
                </div>

                {/* Task list */}
                <ul className="space-y-3 pt-2 text-xs">
                  <li className="flex items-center gap-3">
                    <span
                      className={`flex size-5 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
                        hasTitle && hasAbstract
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'border-ink/20 dark:border-white/20 bg-paper text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink">
                        {t('readinessEnglishTitleAbstract')}
                      </p>
                      <p className="text-[10px] text-ink/50">
                        {t('readinessEnglishHint')}
                      </p>
                    </div>
                  </li>

                  <li className="flex items-center gap-3">
                    <span
                      className={`flex size-5 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
                        sub.titleAr?.trim() && sub.abstractAr?.trim()
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'border-ink/10 dark:border-white/10 bg-paper/30 text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink/80">
                        {t('readinessArabicTitleAbstract')}{' '}
                        <span className="text-[10px] font-normal text-ink/40">
                          ({t('readinessOptional')})
                        </span>
                      </p>
                      <p className="text-[10px] text-ink/40">
                        {t('readinessArabicHint')}
                      </p>
                    </div>
                  </li>

                  <li className="flex items-center gap-3">
                    <span
                      className={`flex size-5 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
                        hasManuscript
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'border-ink/20 dark:border-white/20 bg-paper text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink">
                        {t('readinessManuscriptFile')}
                      </p>
                      <p className="text-[10px] text-ink/50">
                        {hasManuscript
                          ? hasConstructorDraft
                            ? t('readinessConstructorDraft')
                            : t('readinessUploadedDocument')
                          : t('readinessNoFile')}
                      </p>
                    </div>
                  </li>

                  <li className="flex items-center gap-3">
                    <span
                      className={`flex size-5 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
                        hasDiscipline
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'border-ink/20 dark:border-white/20 bg-paper text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink">
                        {t('readinessDiscipline')}
                      </p>
                      <div className="text-[10px] text-ink/50">
                        {hasDiscipline ? (
                          <DisciplineBadges
                            labels={sub.disciplines ?? []}
                            size="sm"
                          />
                        ) : (
                          t('readinessDisciplineRequired')
                        )}
                      </div>
                    </div>
                  </li>
                </ul>

                {/* Submit Section inside Checklist */}
                {canEditConstructor && (
                  <div className="pt-4 border-t border-ink/[0.06] dark:border-white/[0.06] space-y-3">
                    <p className="text-[10px] text-ink/50 leading-relaxed">
                      {t('submitIrreversibleHint')}
                    </p>
                    <Button
                      disabled={submitDisabled}
                      onClick={() =>
                        handleSubmitClick(() => void submitForReview())
                      }
                      className="w-full py-3 text-xs font-bold"
                    >
                      {effectiveSubmitButtonLabel}
                    </Button>
                  </div>
                )}
              </div>
            )}

          {isAuthor &&
            !isEditorView &&
            sub.messageForAuthor?.trim() &&
            isEditorDecisionStatus(sub.status) && (
              <div className="rounded-2xl border border-amber-200/80 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 p-6 shadow-xs space-y-3">
                <h3 className="font-serif text-base font-semibold text-ink border-b border-amber-200/60 dark:border-amber-900/30 pb-3">
                  {t('editorMessageCalloutTitle')}
                </h3>
                <p className="text-sm text-ink/80 whitespace-pre-wrap leading-relaxed">
                  {sub.messageForAuthor}
                </p>
              </div>
            )}

          {isAuthor &&
            !isEditorView &&
            sub.status === 'revisions_requested' &&
            canEditConstructor && (
              <div className="rounded-2xl border border-ink/10 dark:border-white/10 bg-surface p-6 shadow-xs space-y-1.5">
                <label
                  htmlFor="author-response-to-reviewers"
                  className="text-xs font-semibold text-ink"
                >
                  {t('resubmitResponseLabel')}
                </label>
                <p className="text-[10px] text-ink/50">
                  {t('resubmitResponseHint')}
                </p>
                <textarea
                  id="author-response-to-reviewers"
                  value={authorResponseToReviewers}
                  onChange={(e) => setAuthorResponseToReviewers(e.target.value)}
                  placeholder={t('resubmitResponsePlaceholder')}
                  disabled={busy}
                  rows={4}
                  maxLength={8000}
                  className="w-full rounded-lg border border-ink/15 dark:border-white/15 bg-paper px-3 py-2 text-xs text-ink placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
                />
              </div>
            )}

          {/* Author Submission Workflow Stage Tracker */}
          {isAuthor && !isEditorView && sub.status !== 'draft' && (
            <div className="rounded-2xl border border-ink/10 dark:border-white/10 bg-surface p-6 shadow-xs space-y-5">
              <h3 className="font-serif text-base font-semibold text-ink border-b border-ink/[0.06] dark:border-white/[0.06] pb-3">
                {t('workflowProgress')}
              </h3>

              <div className="relative ps-6 space-y-6 before:absolute before:start-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-ink/[0.06] dark:before:bg-white/[0.06]">
                {/* Step 1: Submitted */}
                <div className="relative">
                  <span className="absolute -start-6 top-0.5 flex size-4.5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
                    ✓
                  </span>
                  <p className="text-xs font-bold text-ink">
                    {t('workflowSubmitted')}
                  </p>
                  <p className="text-[10px] text-ink/50">
                    {t('workflowSubmittedHint')}
                  </p>
                </div>

                {/* Step 2: Under Review */}
                <div className="relative">
                  <span
                    className={`absolute -start-6 top-0.5 flex size-4.5 items-center justify-center rounded-full border text-[10px] font-bold ${
                      sub.status === 'under_review' ||
                      sub.status === 'revisions_requested'
                        ? 'border-blue-500 bg-blue-500 text-white animate-pulse'
                        : sub.status === 'accepted' ||
                            sub.status === 'published'
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : 'border-ink/20 dark:border-white/20 bg-paper text-ink/40'
                    }`}
                  >
                    {sub.status === 'accepted' || sub.status === 'published'
                      ? '✓'
                      : '2'}
                  </span>
                  <p
                    className={`text-xs font-bold ${
                      sub.status === 'under_review'
                        ? 'text-blue-600 dark:text-blue-400'
                        : sub.status === 'revisions_requested'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-ink'
                    }`}
                  >
                    {t('workflowPeerReview')}
                  </p>
                  <p className="text-[10px] text-ink/50">
                    {sub.status === 'under_review'
                      ? t('workflowPeerReviewActive')
                      : sub.status === 'revisions_requested'
                        ? t('workflowPeerReviewRevisions')
                        : sub.status === 'accepted' ||
                            sub.status === 'published'
                          ? t('workflowPeerReviewDone')
                          : t('workflowPeerReviewWaiting')}
                  </p>
                </div>

                {/* Step 3: Decision */}
                <div className="relative">
                  <span
                    className={`absolute -start-6 top-0.5 flex size-4.5 items-center justify-center rounded-full border text-[10px] font-bold ${
                      sub.status === 'accepted'
                        ? 'border-emerald-500 bg-emerald-500 text-white animate-pulse'
                        : sub.status === 'published'
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : sub.status === 'rejected'
                            ? 'border-rose-500 bg-rose-500 text-white'
                            : 'border-ink/20 dark:border-white/20 bg-paper text-ink/40'
                    }`}
                  >
                    {sub.status === 'published'
                      ? '✓'
                      : sub.status === 'rejected'
                        ? '✕'
                        : '3'}
                  </span>
                  <p
                    className={`text-xs font-bold ${sub.status === 'rejected' ? 'text-rose-600 dark:text-rose-400' : 'text-ink'}`}
                  >
                    {t('workflowDecision')}
                  </p>
                  <p className="text-[10px] text-ink/50">
                    {sub.status === 'accepted'
                      ? t('workflowDecisionAccepted')
                      : sub.status === 'published'
                        ? t('workflowDecisionPublished')
                        : sub.status === 'rejected'
                          ? t('workflowDecisionRejected')
                          : sub.status === 'revisions_requested'
                            ? t('workflowDecisionRevisions')
                            : t('workflowDecisionWaiting')}
                  </p>
                </div>

                {/* Step 4: Published */}
                {sub.status !== 'rejected' && (
                  <div className="relative">
                    <span
                      className={`absolute -start-6 top-0.5 flex size-4.5 items-center justify-center rounded-full border text-[10px] font-bold ${
                        sub.status === 'published'
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : 'border-ink/20 dark:border-white/20 bg-paper text-ink/40'
                      }`}
                    >
                      {sub.status === 'published' ? '✓' : '4'}
                    </span>
                    <p
                      className={`text-xs font-bold ${sub.status === 'published' ? 'text-emerald-600 dark:text-emerald-400' : 'text-ink'}`}
                    >
                      {t('workflowPublished')}
                    </p>
                    <p className="text-[10px] text-ink/50">
                      {sub.status === 'published'
                        ? t('workflowPublishedLive')
                        : t('workflowPublishedPending')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Editor Command Center in Sidebar */}
          {isEditorView && (
            <div className="rounded-2xl border border-ink/10 dark:border-white/10 bg-surface p-6 shadow-xs space-y-6 relative overflow-hidden">
              <div className="absolute -right-16 -top-16 size-36 rounded-full bg-accent/5 blur-2xl" />

              <div className="flex items-center justify-between border-b border-ink/[0.06] dark:border-white/[0.06] pb-3">
                <h2 className="font-serif text-base font-semibold text-ink">
                  {t('editorCommandCenter')}
                </h2>
                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[9px] font-bold text-accent uppercase tracking-wider">
                  {t('editorAdminBadge')}
                </span>
              </div>

              {showReviewConfiguration && (
                <div className="rounded-xl border border-ink/10 dark:border-white/10 bg-paper/40 p-4 space-y-3">
                  <div className="flex flex-col gap-1 text-xs font-medium text-ink">
                    <span id={reviewMethodSelectId}>
                      {t('reviewMethodLabel')}
                    </span>
                    <SimpleSelect
                      value={sub.reviewMethod ?? 'double_anonymous'}
                      onValueChange={(v) => void patchReviewMethod(v)}
                      options={[
                        { value: 'open', label: t('reviewMethod_open') },
                        {
                          value: 'anonymous',
                          label: t('reviewMethod_anonymous'),
                        },
                        {
                          value: 'double_anonymous',
                          label: t('reviewMethod_double_anonymous'),
                        },
                      ]}
                      disabled={busy}
                      className="w-full"
                      aria-labelledby={reviewMethodSelectId}
                    />
                  </div>
                  <p className="text-[10px] leading-relaxed text-ink/65">
                    {t('reviewMethodHint')}
                  </p>
                  <p className="text-[10px] leading-relaxed text-amber-800 dark:text-amber-400">
                    {t('reviewPackageEditorHint')}
                  </p>
                </div>
              )}

              {/* Set Status Box */}
              <div className="rounded-xl border border-ink/10 dark:border-white/10 bg-paper/40 p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink/40">
                  {t('updateStatus')}
                </h3>
                <p className="text-[10px] text-ink/50">
                  {t('editorWorkflowColumnHint')}
                </p>
                <div className="flex flex-col gap-1 text-sm font-medium text-ink">
                  <span id="status-select-label" className="sr-only">
                    {t('setStatus')}
                  </span>
                  <SimpleSelect
                    value={statusPick}
                    onValueChange={setStatusPick}
                    options={statuses.map((s) => ({
                      value: s,
                      label:
                        s === 'rejected'
                          ? sub.status === 'submitted'
                            ? tSub('stRejectedDeskReject')
                            : tSub('stRejectedPostReview')
                          : submissionStatusLabel(s, tSub),
                    }))}
                    className="w-full"
                    aria-labelledby="status-select-label"
                  />
                </div>
                {isEditorDecisionStatus(statusPick) && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="message-for-author"
                      className="text-xs font-semibold text-ink"
                    >
                      {t('messageForAuthorLabel')}
                    </label>
                    <p className="text-[10px] text-ink/50">
                      {t('messageForAuthorHint')}
                    </p>
                    <textarea
                      id="message-for-author"
                      value={messageForAuthor}
                      onChange={(e) => setMessageForAuthor(e.target.value)}
                      placeholder={t('messageForAuthorPlaceholder')}
                      disabled={busy}
                      rows={4}
                      maxLength={4000}
                      className="w-full rounded-lg border border-ink/15 dark:border-white/15 bg-paper px-3 py-2 text-xs text-ink placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
                    />
                  </div>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void updateStatus()}
                  className="w-full rounded-xl bg-ink text-paper dark:bg-white dark:text-paper px-4 py-2.5 text-xs font-bold shadow-2xs hover:bg-ink/90 active:scale-[0.98] select-none transition-all duration-150 disabled:opacity-50"
                >
                  {t('applyStatus')}
                </button>
              </div>

              {/* Assign Section Editor Box */}
              {canAssignSectionEditor && (
                <div className="rounded-xl border border-ink/10 dark:border-white/10 bg-paper/40 p-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ink/40">
                    {t('sectionEditorPanel')}
                  </h3>
                  {sub.sectionEditorAssignment?.sectionEditor && (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-ink/10 dark:border-white/10 bg-paper/60 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-ink">
                          {
                            sub.sectionEditorAssignment.sectionEditor
                              .displayName
                          }
                        </p>
                        <p className="truncate text-[10px] text-ink/50">
                          {sub.sectionEditorAssignment.sectionEditor.email}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void removeSectionEditorAssignment()}
                        className="shrink-0 rounded-lg border border-red-400/30 px-2 py-1 text-[10px] font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-50"
                      >
                        {t('removeSectionEditorAssignment')}
                      </button>
                    </div>
                  )}
                  <SectionEditorSuggestionsPanel
                    slug={sub.slug}
                    disabled={busy}
                    onPick={setSectionEditorPick}
                  />
                  <div className="flex flex-col gap-1 text-sm font-medium text-ink">
                    <span id="se-select-label" className="sr-only">
                      {t('sectionEditorLabel')}
                    </span>
                    <SearchableSelect
                      options={sectionEditorCandidates.map((c) => ({
                        value: c.id,
                        label: `${c.displayName} (${c.email})`,
                        keywords: [c.displayName, c.email, ...c.disciplines],
                      }))}
                      value={sectionEditorPick}
                      onValueChange={setSectionEditorPick}
                      placeholder={t('sectionEditorPlaceholder')}
                      searchPlaceholder={tUi('searchPlaceholder')}
                      emptyText={tUi('noResults')}
                      disabled={busy}
                      className="w-full animate-fade-in"
                      aria-labelledby="se-select-label"
                    />
                  </div>
                  <Button
                    disabled={busy || !sectionEditorPick.trim()}
                    onClick={() => void assignSectionEditor()}
                    className="w-full text-xs font-bold"
                  >
                    {t('assignSectionEditor')}
                  </Button>
                </div>
              )}

              {/* Assign Reviewer Box */}
              <div className="rounded-xl border border-ink/10 dark:border-white/10 bg-paper/40 p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink/40">
                  {t('assignReviewerSidebar')}
                </h3>
                {canAssignReviewer ? (
                  <>
                    <p className="text-[10px] text-ink/50">
                      {t('editorAssignColumnHint')}
                    </p>
                    {editorAssignmentRows.some(
                      (a) => a.status === 'invited' || a.status === 'accepted',
                    ) && (
                      <p className="text-[10px] text-ink/60">
                        {t('reviewerAssignAdditionalHint')}
                      </p>
                    )}
                    {reviewersLoadError && (
                      <p className="text-[10px] text-red-600">
                        {reviewersLoadError}
                      </p>
                    )}
                    <ReviewerSuggestionsPanel
                      slug={sub.slug}
                      disabled={busy || !!reviewersLoadError}
                      onPick={setReviewerPick}
                    />
                    <div className="flex flex-col gap-1 text-sm font-medium text-ink">
                      <span id="reviewer-select-label" className="sr-only">
                        {t('reviewerLabel')}
                      </span>
                      <SearchableSelect
                        options={reviewerCandidates.map((c) => ({
                          value: c.id,
                          label: `${c.displayName} (${c.email})`,
                          keywords: [c.displayName, c.email],
                        }))}
                        value={reviewerPick}
                        onValueChange={setReviewerPick}
                        placeholder={t('reviewerPlaceholder')}
                        searchPlaceholder={tUi('searchPlaceholder')}
                        emptyText={tUi('noResults')}
                        disabled={busy || !!reviewersLoadError}
                        className="w-full animate-fade-in"
                        aria-labelledby="reviewer-select-label"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-ink/50">
                          {t('assignResponseDue')}
                        </label>
                        <input
                          type="date"
                          value={assignResponseDue}
                          onChange={(e) => setAssignResponseDue(e.target.value)}
                          disabled={busy}
                          className="rounded-md border border-ink/15 bg-surface px-2 py-1 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-ink/50">
                          {t('assignReviewDue')}
                        </label>
                        <input
                          type="date"
                          value={assignReviewDue}
                          onChange={(e) => setAssignReviewDue(e.target.value)}
                          disabled={busy}
                          className="rounded-md border border-ink/15 bg-surface px-2 py-1 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wide text-ink/50">
                        {t('assignEditorInstructions')}
                      </label>
                      <textarea
                        rows={3}
                        value={assignEditorInstructions}
                        onChange={(e) =>
                          setAssignEditorInstructions(e.target.value)
                        }
                        disabled={busy}
                        maxLength={10000}
                        placeholder={t('assignEditorInstructionsHint')}
                        className="rounded-md border border-ink/15 bg-surface px-2 py-1 text-xs text-ink placeholder:text-ink/35 focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50 resize-none"
                      />
                    </div>
                    <Button
                      disabled={
                        busy || !reviewerPick.trim() || !!reviewersLoadError
                      }
                      onClick={() => void assignReviewer()}
                      className="w-full text-xs font-bold"
                    >
                      {t('assignReviewer')}
                    </Button>
                    {!reviewersLoadError && reviewerCandidates.length === 0 && (
                      <p className="text-[10px] text-ink/50 text-center">
                        {t('noReviewersAvailable')}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-[10px] text-ink/50">
                    {t('reviewerAssignClosedHint')}
                  </p>
                )}
              </div>

              {/* Active assignments and email reminders */}
              {editorAssignmentRows.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-ink/[0.06] dark:border-white/[0.06]">
                  <h3 className="font-serif text-sm font-semibold text-ink">
                    {t('editorAssignmentsTitle')}
                  </h3>
                  <div className="space-y-3">
                    {editorAssignmentRows.map((a) => {
                      const name =
                        a.reviewer?.displayName?.trim() ||
                        a.reviewer?.email?.trim() ||
                        a.reviewerId;
                      const asg = a.slug ? String(a.slug) : '';
                      const remList = asg
                        ? (assignmentReminders[asg] ?? [])
                        : [];
                      const remindersFailed = asg
                        ? reminderLoadFailedByAssignment[asg] === true
                        : false;
                      const reviewForAssignment = editorReviews.find(
                        (r) => r.assignmentId === a.id,
                      );
                      return (
                        <div
                          key={a.id}
                          className="rounded-xl border border-ink/10 dark:border-white/10 bg-paper/60 p-4 space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span
                              className="font-medium text-xs text-ink truncate max-w-[120px]"
                              title={name}
                            >
                              {name}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {reviewForAssignment && (
                                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
                                  {recommendationLabel(
                                    reviewForAssignment.recommendation,
                                    tCommon,
                                  )}
                                </span>
                              )}
                              <span
                                className={assignmentStatusPillClass(a.status)}
                              >
                                {assignmentStatusLabel(a.status, tAssign)}
                              </span>
                            </div>
                          </div>
                          <div className="border-t border-ink/10 dark:border-white/10 pt-3 space-y-2 text-[11px]">
                            <p className="font-semibold text-ink/80">
                              {t('emailRemindersTitle')}
                            </p>
                            {canManageReminders && (
                              <p className="text-[10px] leading-relaxed text-ink/55">
                                {t('emailRemindersHint')}
                              </p>
                            )}
                            {!a.slug ? (
                              <p className="text-amber-700">
                                {t('reminderNoSlug')}
                              </p>
                            ) : remindersFailed ? (
                              <p className="text-red-700 dark:text-red-400">
                                {t('reminderLoadFailed')}
                              </p>
                            ) : remList.length === 0 ? (
                              <p className="text-ink/40">
                                {t('reminderNoneScheduled')}
                              </p>
                            ) : (
                              <div className="space-y-3">
                                {remList.map((r) => {
                                  const rescheduleValue =
                                    reminderRescheduleInputValue(
                                      reminderRescheduleAt,
                                      r.id,
                                      r.sendAt,
                                    );
                                  return (
                                    <div
                                      key={r.id}
                                      className="p-2 rounded-lg bg-ink/5 dark:bg-white/5 space-y-2 border border-ink/[0.03]"
                                    >
                                      <div className="flex items-center justify-between text-[10px] font-medium">
                                        <span className="text-ink/50">
                                          {r.kind === 'review_overdue'
                                            ? t('reminderKindOverdue')
                                            : t('reminderKindDueSoon')}
                                        </span>
                                        <span className="px-1 py-0.5 rounded bg-ink/10 dark:bg-white/10 font-mono text-[9px]">
                                          {r.status}
                                        </span>
                                      </div>
                                      <p className="text-[10px] text-ink/65">
                                        <span className="font-medium text-ink/50">
                                          {t('reminderSendAt')}:{' '}
                                        </span>
                                        <time
                                          className="font-mono"
                                          dateTime={r.sendAt}
                                        >
                                          {new Date(r.sendAt).toLocaleString(
                                            locale,
                                            {
                                              dateStyle: 'short',
                                              timeStyle: 'short',
                                            },
                                          )}
                                        </time>
                                      </p>
                                      {r.status === 'pending' &&
                                        canManageReminders && (
                                          <div className="flex flex-col gap-1.5 pt-1.5 border-t border-ink/[0.05] dark:border-white/[0.05]">
                                            <label className="text-[10px] font-medium text-ink/55">
                                              {t(
                                                'reminderReschedulePlaceholder',
                                              )}
                                            </label>
                                            <input
                                              type="datetime-local"
                                              step={60}
                                              min={minReminderRescheduleDatetimeLocal(
                                                REMINDER_MIN_LEAD_MS,
                                              )}
                                              className="rounded border border-ink/15 bg-paper px-2 py-1 text-[10px] text-ink w-full"
                                              value={rescheduleValue}
                                              onChange={(e) =>
                                                setReminderRescheduleAt(
                                                  (prev) => ({
                                                    ...prev,
                                                    [r.id]: e.target.value,
                                                  }),
                                                )
                                              }
                                            />
                                            <div className="flex items-center gap-1">
                                              <button
                                                type="button"
                                                disabled={
                                                  busy ||
                                                  !rescheduleValue.trim()
                                                }
                                                className="flex-1 rounded bg-ink/80 hover:bg-ink dark:bg-white/80 dark:hover:bg-white dark:text-paper px-2 py-1 text-[9px] font-semibold text-paper disabled:opacity-50 transition-colors"
                                                onClick={() =>
                                                  void patchReminderSendAt(
                                                    asg,
                                                    r.id,
                                                  )
                                                }
                                              >
                                                {t('reminderApplyReschedule')}
                                              </button>
                                              <button
                                                type="button"
                                                disabled={busy}
                                                className="rounded border border-red-200 dark:border-red-900/30 px-2 py-1 text-[9px] font-semibold text-red-800 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-50 transition-colors"
                                                onClick={() =>
                                                  void cancelReminderRow(
                                                    asg,
                                                    r.id,
                                                  )
                                                }
                                              >
                                                {t('reminderCancel')}
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
                          {asg && (
                            <EditorAssignmentDiscussion assignmentSlug={asg} />
                          )}
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
