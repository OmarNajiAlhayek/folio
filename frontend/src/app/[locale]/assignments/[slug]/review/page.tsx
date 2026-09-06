'use client';

import {
  CircleX,
  ChevronDown,
  ChevronUp,
  Paperclip,
  Plus,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useState } from 'react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { useParams } from 'next/navigation';
import { apiBlob, apiFetch, apiJson, apiUpload, ApiError } from '@/lib/api';
import { FileDropZone } from '@/components/ui/file-drop-zone';
import { ACCEPT_MANUSCRIPT } from '@/lib/upload-accept';
import { redirectToLogin } from '@/lib/auth-redirect';
import { ApiErrorState } from '@/components/api-error-state';
import { toast } from '@/lib/toast';
import { useApiErrorMessages } from '@/lib/use-api-error-messages';
import { useToastApiError } from '@/lib/use-toast-api-error';
import { PAGE_SHELL } from '@/lib/page-shell';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import {
  createReviewSchema,
  fileExceedsUploadLimit,
  formatZodIssues,
  joinValidationBulletList,
  MAX_UPLOAD_MB,
  REVIEW_RECOMMENDATION_CHOICES,
  safeParseResult,
} from '@/lib/validation';

/**
 * The legacy undifferentiated `revisions` value is intentionally absent: it is
 * still accepted by the API for rows written before the minor/major split, but
 * reviewers now choose a severity.
 */
const recs = REVIEW_RECOMMENDATION_CHOICES;
type Rec = (typeof recs)[number];

const ABSTRACT_PREVIEW_LEN = 420;

type ReviewFileRow = {
  id: string;
  originalName: string;
  mimeType: string;
  kind?: string;
  fileStage?: string;
};

type DiscussionMessage = {
  id: string;
  body: string;
  createdAt: string;
  author?: { id: string; displayName: string } | null;
};

type DiscussionRow = {
  id: string;
  subject: string;
  createdAt: string;
  messages: DiscussionMessage[];
};

type AssignmentRow = {
  id: string;
  slug: string | null;
  status: string;
  assignedAt?: string;
  responseDueAt?: string | null;
  reviewDueAt?: string | null;
  assignedBy?: { id: string; displayName: string } | null;
  editorInstructions?: string;
  review?: {
    id: string;
    recommendation: string;
    submittedAt: string;
  } | null;
  discussions?: DiscussionRow[];
  submission?: {
    id: string;
    title: string;
    titleAr?: string | null;
    status: string;
    slug?: string | null;
    abstract?: string;
    abstractAr?: string | null;
    reviewMethod?: string;
    files?: ReviewFileRow[];
  };
};

type SubmissionStatusMsg =
  | 'stDraft'
  | 'stSubmitted'
  | 'stUnderReview'
  | 'stRevisions'
  | 'stAccepted'
  | 'stRejected'
  | 'stPublished';

function submissionStatusKey(status: string): SubmissionStatusMsg | null {
  const map: Record<string, SubmissionStatusMsg> = {
    draft: 'stDraft',
    submitted: 'stSubmitted',
    under_review: 'stUnderReview',
    revisions_requested: 'stRevisions',
    accepted: 'stAccepted',
    rejected: 'stRejected',
    published: 'stPublished',
  };
  return map[status] ?? null;
}

function ReviewSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-9 w-2/3 max-w-md rounded-xl" />
      <div className="flex flex-col gap-6">
        <div className="rounded-xl border border-ink/10 bg-surface p-6 shadow-sm space-y-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-28" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
        <div className="rounded-xl border border-ink/10 bg-surface p-6 shadow-sm space-y-3">
          <Skeleton className="h-5 w-32" />
          <div className="space-y-3">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export default function ReviewFormPage() {
  const t = useTranslations('AssignmentsReview');
  const tv = useTranslations('Validation');
  const tCommon = useTranslations('Common');
  const tSub = useTranslations('Submissions');
  const tAssignments = useTranslations('Assignments');
  const tWf = useTranslations('SubmissionWorkflow');
  const params = useParams();
  const slug = params.slug as string;
  const pathname = usePathname();
  const router = useRouter();
  const recGroupId = useId();

  const [commentsForAuthor, setCommentsForAuthor] = useState('');
  const [commentsToEditorOnly, setCommentsToEditorOnly] = useState('');
  const [recommendation, setRecommendation] = useState<Rec>('accept');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [abstractExpandedEn, setAbstractExpandedEn] = useState(false);
  const [abstractExpandedAr, setAbstractExpandedAr] = useState(false);

  const [pageLoading, setPageLoading] = useState(true);
  const [contextError, setContextError] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<AssignmentRow | null>(null);
  const [contextMissing, setContextMissing] = useState<
    'notFound' | 'invited' | 'completed' | 'notOpen' | null
  >(null);
  const [contextErrorCause, setContextErrorCause] = useState<unknown>(null);
  const { resolve: resolveApiError } = useApiErrorMessages();
  const tApi = useTranslations('ApiErrors');
  const showApiError = useToastApiError();

  // Guidelines
  const [guidelines, setGuidelines] = useState<string>('');

  // Reviewer files
  const [reviewerFiles, setReviewerFiles] = useState<ReviewFileRow[]>([]);
  const [uploading, setUploading] = useState(false);

  // Discussions
  const [discussions, setDiscussions] = useState<DiscussionRow[]>([]);
  const [expandedDiscussionId, setExpandedDiscussionId] = useState<
    string | null
  >(null);
  const [showNewDiscussion, setShowNewDiscussion] = useState(false);
  const [newDiscSubject, setNewDiscSubject] = useState('');
  const [newDiscBody, setNewDiscBody] = useState('');
  const [submittingDiscussion, setSubmittingDiscussion] = useState(false);
  const [replyBodies, setReplyBodies] = useState<Record<string, string>>({});
  const [submittingReply, setSubmittingReply] = useState<string | null>(null);

  const loadContext = useCallback(async () => {
    setPageLoading(true);
    setContextError(null);
    setContextErrorCause(null);
    setContextMissing(null);
    setAssignment(null);
    try {
      const row = await apiJson<AssignmentRow>(
        `/assignments/${encodeURIComponent(slug)}`,
      );
      setAssignment(row);
      if (row.status === 'invited') {
        setContextMissing('invited');
        return;
      }
      if (row.status === 'completed') {
        setContextMissing('completed');
        return;
      }
      if (row.status !== 'accepted') {
        setContextMissing('notOpen');
        return;
      }
      if (row.discussions) setDiscussions(row.discussions);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        redirectToLogin(router, pathname);
        return;
      }
      if (err instanceof ApiError && err.status === 403) {
        setContextError(
          (err as ApiError & { code?: string }).code === 'FORBIDDEN'
            ? t('wrongReviewerAccount')
            : tAssignments('needReviewerRole'),
        );
        return;
      }
      if (err instanceof ApiError && err.status === 404) {
        setContextMissing('notFound');
        return;
      }
      setContextErrorCause(err);
      setContextError(resolveApiError(err, t('loadFailed')));
    } finally {
      setPageLoading(false);
    }
  }, [slug, router, pathname, t, tAssignments, resolveApiError]);

  useEffect(() => {
    loadContext().catch(() => {
      setContextError(t('loadFailed'));
      setPageLoading(false);
    });
  }, [loadContext, router, pathname, t]);

  useEffect(() => {
    apiJson<{ value: string }>('/journal/settings/reviewer-guidelines')
      .then((r) => setGuidelines(r.value ?? ''))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!assignment || assignment.status !== 'accepted') return;
    apiJson<ReviewFileRow[]>(`/assignments/${encodeURIComponent(slug)}/files`)
      .then((files) => setReviewerFiles(files))
      .catch(() => {});
  }, [slug, assignment]);

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
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      toast.success(t('submitSuccess'), {
        id: 'assignment-review-submit-success',
      });
      // Reload page to show completion state
      await loadContext();
    } catch (err) {
      showApiError(err, t('submitFailed'), { id: 'assignment-review-submit' });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFileUpload(file: File) {
    if (fileExceedsUploadLimit(file)) {
      toast.error(t('uploadTooLarge', { max: MAX_UPLOAD_MB }), {
        id: 'assignment-review-upload',
      });
      return;
    }
    setUploading(true);
    try {
      const saved = (await apiUpload(
        `/assignments/${encodeURIComponent(slug)}/files`,
        file,
      )) as ReviewFileRow;
      setReviewerFiles((prev) => [...prev, saved]);
      toast.success(t('uploadSuccess'), {
        id: 'assignment-review-upload-success',
      });
    } catch (err) {
      showApiError(err, t('uploadFailed'), { id: 'assignment-review-upload' });
    } finally {
      setUploading(false);
    }
  }

  /** Only possible before an editor releases the file to the author. */
  async function removeReviewerFile(fileId: string) {
    setUploading(true);
    try {
      await apiFetch(
        `/assignments/${encodeURIComponent(slug)}/files/${encodeURIComponent(fileId)}`,
        { method: 'DELETE' },
      );
      setReviewerFiles((prev) => prev.filter((f) => f.id !== fileId));
      toast.success(t('uploadRemoved'), {
        id: 'assignment-review-upload-removed',
      });
    } catch (err) {
      showApiError(err, t('uploadRemoveFailed'), {
        id: 'assignment-review-upload',
      });
    } finally {
      setUploading(false);
    }
  }

  async function submitNewDiscussion() {
    if (!newDiscBody.trim()) return;
    setSubmittingDiscussion(true);
    try {
      const disc = await apiJson<DiscussionRow>(
        `/assignments/${encodeURIComponent(slug)}/discussions`,
        {
          method: 'POST',
          body: JSON.stringify({ subject: newDiscSubject, body: newDiscBody }),
        },
      );
      setDiscussions((prev) => [...prev, disc]);
      setNewDiscSubject('');
      setNewDiscBody('');
      setShowNewDiscussion(false);
      setExpandedDiscussionId(disc.id);
    } catch (err) {
      showApiError(err, t('discussionFailed'), {
        id: 'assignment-discussion-create',
      });
    } finally {
      setSubmittingDiscussion(false);
    }
  }

  async function submitReply(discussionId: string) {
    const body = replyBodies[discussionId]?.trim();
    if (!body) return;
    setSubmittingReply(discussionId);
    try {
      const msg = await apiJson<DiscussionMessage>(
        `/assignments/${encodeURIComponent(slug)}/discussions/${discussionId}/messages`,
        { method: 'POST', body: JSON.stringify({ body }) },
      );
      setDiscussions((prev) =>
        prev.map((d) =>
          d.id === discussionId ? { ...d, messages: [...d.messages, msg] } : d,
        ),
      );
      setReplyBodies((prev) => ({ ...prev, [discussionId]: '' }));
    } catch (err) {
      showApiError(err, t('replyFailed'), { id: 'assignment-reply' });
    } finally {
      setSubmittingReply(null);
    }
  }

  const sub = assignment?.submission;
  const abstractEn = sub?.abstract?.trim() ?? '';
  const abstractArText = sub?.abstractAr?.trim() ?? '';
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
    statusKey != null ? tSub(statusKey) : (sub?.status ?? '—');

  /** Accepts the legacy `revisions` value so reviews filed before the
   *  minor/major split still render a translated label. */
  const recLabel = (r: Rec | 'revisions'): string => {
    const map: Record<Rec | 'revisions', string> = {
      revisions: tCommon('recRevisions'),
      accept: tCommon('recAccept'),
      minor_revisions: tCommon('recMinorRevisions'),
      major_revisions: tCommon('recMajorRevisions'),
      resubmit_for_review: tCommon('recResubmitForReview'),
      resubmit_elsewhere: tCommon('recResubmitElsewhere'),
      reject: tCommon('recReject'),
      see_comments: tCommon('recSeeComments'),
    };
    return map[r];
  };

  const recHint = (r: Rec): string => {
    const map: Record<Rec, string> = {
      accept: t('recHintAccept'),
      minor_revisions: t('recHintMinorRevisions'),
      major_revisions: t('recHintMajorRevisions'),
      resubmit_for_review: t('recHintResubmitForReview'),
      resubmit_elsewhere: t('recHintResubmitElsewhere'),
      reject: t('recHintReject'),
      see_comments: t('recHintSeeComments'),
    };
    return map[r];
  };

  const commentsOptional = recommendation === 'accept';

  async function downloadReviewFile(file: ReviewFileRow) {
    const subSlug = sub?.slug;
    if (!subSlug) return;
    try {
      const blob = await apiBlob(
        `/submissions/${encodeURIComponent(subSlug)}/files/${file.id}`,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.originalName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t('downloadFailed'), { id: 'assignment-review-download' });
    }
  }

  const showForm =
    assignment && assignment.status === 'accepted' && !contextMissing;

  return (
    <main className={PAGE_SHELL}>
      <Link
        href="/assignments"
        className="text-sm font-medium text-accent hover:underline"
      >
        {t('back')}
      </Link>

      {pageLoading && (
        <div className="mt-6">
          <ReviewSkeleton />
        </div>
      )}

      {!pageLoading && contextError && (
        <div className="mt-8">
          <ApiErrorState
            className="max-w-none px-0 py-0"
            message={contextError}
            error={contextErrorCause}
            onRetry={() => void loadContext()}
            retryLabel={tApi('retry')}
            backHref="/assignments"
            backLabel={t('backToAssignments')}
          />
        </div>
      )}

      {!pageLoading && !contextError && contextMissing === 'notFound' && (
        <div className="mt-8 rounded-xl border border-ink/10 bg-surface p-8 text-center shadow-sm">
          <p className="text-ink/80">{t('notFound')}</p>
          <Link
            href="/assignments"
            className="mt-6 inline-block rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white hover:opacity-95"
          >
            {t('backToAssignments')}
          </Link>
        </div>
      )}

      {!pageLoading &&
        !contextError &&
        contextMissing === 'invited' &&
        assignment && (
          <div className="mt-8 rounded-xl border border-ink/10 bg-surface p-8 shadow-sm">
            <p className="font-serif text-lg text-ink">
              {sub?.title ?? tAssignments('submissionFallback')}
            </p>
            <p className="mt-4 text-sm text-ink/75">
              {t('acceptInvitationFirst')}
            </p>
            <Link
              href={`/assignments/${encodeURIComponent(slug)}/invite`}
              className="mt-6 inline-block rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white hover:opacity-95"
            >
              {t('goToInvitation')}
            </Link>
            <Link
              href="/assignments"
              className="mt-4 ms-4 inline-block text-sm font-medium text-accent hover:underline"
            >
              {t('backToAssignments')}
            </Link>
          </div>
        )}

      {/* Completion section */}
      {!pageLoading &&
        !contextError &&
        contextMissing === 'completed' &&
        assignment && (
          <div className="mt-8 rounded-xl border border-green-200 bg-green-50 p-8 shadow-sm">
            <p className="font-sans text-xs font-semibold uppercase tracking-wider text-green-700">
              {t('eyebrow')}
            </p>
            <h1 className="mt-2 font-serif text-2xl font-semibold text-green-900">
              {t('completedHeading')}
            </h1>
            <p className="mt-1 font-serif text-lg text-ink/80">
              {sub?.title ?? tAssignments('submissionFallback')}
            </p>
            {assignment.review && (
              <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-white/60 px-4 py-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                    {t('completedRecommendation')}
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-ink">
                    {recLabel(
                      assignment.review.recommendation as Rec | 'revisions',
                    ) ?? assignment.review.recommendation}
                  </dd>
                </div>
                <div className="rounded-lg bg-white/60 px-4 py-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                    {t('completedAt')}
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-ink">
                    {new Date(assignment.review.submittedAt).toLocaleDateString(
                      undefined,
                      {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      },
                    )}
                  </dd>
                </div>
              </dl>
            )}
            <Link
              href="/assignments"
              className="mt-8 inline-block text-sm font-medium text-accent hover:underline"
            >
              {t('backToAssignments')}
            </Link>
          </div>
        )}

      {!pageLoading &&
        !contextError &&
        contextMissing === 'notOpen' &&
        assignment && (
          <div className="mt-8 rounded-xl border border-ink/10 bg-surface p-8 shadow-sm">
            <p className="font-serif text-lg text-ink">
              {sub?.title ?? tAssignments('submissionFallback')}
            </p>
            <p className="mt-4 text-sm text-ink/75">{t('notPending')}</p>
            <Link
              href="/assignments"
              className="mt-6 inline-block text-sm font-medium text-accent hover:underline"
            >
              {t('backToAssignments')}
            </Link>
          </div>
        )}

      {!pageLoading && !contextError && showForm && (
        <>
          <p className="mt-6 font-sans text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            {t('eyebrow')}
          </p>
          <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            {t('title')}
          </h1>

          <div className="mt-10 flex flex-col gap-8">
            {/* Section 2: Guidelines */}
            {(guidelines.trim() || assignment.editorInstructions?.trim()) && (
              <section
                className="rounded-xl border border-ink/10 bg-surface p-6 shadow-sm sm:p-8"
                aria-labelledby="guidelines-heading"
              >
                <h2
                  id="guidelines-heading"
                  className="font-sans text-xs font-semibold uppercase tracking-wider text-ink/50"
                >
                  {t('guidelinesSection')}
                </h2>
                {guidelines.trim() && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                      {t('journalGuidelines')}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/80">
                      {guidelines}
                    </p>
                  </div>
                )}
                {assignment.editorInstructions?.trim() && (
                  <div
                    className={cn(
                      'mt-4',
                      guidelines.trim() && 'border-t border-ink/8 pt-4',
                    )}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                      {t('editorInstructions')}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/80">
                      {assignment.editorInstructions}
                    </p>
                  </div>
                )}
              </section>
            )}

            {/* Section 1 + 3: Manuscript + Download + Upload */}
            <section
              className="rounded-xl border border-ink/10 bg-surface p-6 shadow-sm sm:p-8"
              aria-labelledby="manuscript-heading"
            >
              <h2
                id="manuscript-heading"
                className="font-sans text-xs font-semibold uppercase tracking-wider text-ink/50"
              >
                {t('manuscriptSection')}
              </h2>
              <div className="mt-4">
                <p className="font-serif text-xl font-semibold leading-snug text-ink sm:text-2xl">
                  {sub?.title ?? tAssignments('submissionFallback')}
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
                  {t('submissionStatus')}
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
                        {tWf('abstractLabelEn')}
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
                            ? t('showLessAbstract')
                            : t('showMoreAbstract')}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {abstractArText ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                        {tWf('abstractLabelAr')}
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
                            ? t('showLessAbstract')
                            : t('showMoreAbstract')}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="mt-6 text-sm italic text-ink/45">—</p>
              )}

              {/* Double-blind notice */}
              {sub?.reviewMethod === 'double_anonymous' && (
                <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                  {t('doubleBlindNote')}
                </p>
              )}

              {/* Download review package */}
              {sub?.files && sub.files.length > 0 ? (
                <div className="mt-8">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                    {t('reviewPackageFiles')}
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {sub.files.map((file) => (
                      <li
                        key={file.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink/10 bg-paper/50 px-3 py-2 text-sm"
                      >
                        <span
                          className="min-w-0 truncate text-ink"
                          title={file.originalName}
                        >
                          {file.originalName}
                        </span>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void downloadReviewFile(file)}
                        >
                          {t('downloadFile')}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* Upload review response file */}
              <div className="mt-8 border-t border-ink/8 pt-6">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                  {t('uploadSection')}
                </h3>
                <p className="mt-1 text-xs text-ink/50">{t('uploadHint')}</p>
                {reviewerFiles.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {reviewerFiles.map((file) => (
                      <li
                        key={file.id}
                        className="flex items-center gap-2 rounded-lg border border-ink/10 bg-paper/50 px-3 py-2 text-sm"
                      >
                        <Paperclip
                          className="size-4 shrink-0 text-ink/40"
                          aria-hidden
                        />
                        <span
                          className="min-w-0 flex-1 truncate text-ink"
                          title={file.originalName}
                        >
                          {file.originalName}
                        </span>
                        <button
                          type="button"
                          disabled={uploading}
                          onClick={() => void removeReviewerFile(file.id)}
                          className="shrink-0 rounded-md p-1 text-ink/40 transition-colors hover:bg-rose-500/10 hover:text-rose-600 disabled:opacity-50"
                          aria-label={t('uploadRemoveLabel')}
                          title={t('uploadRemoveLabel')}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <FileDropZone
                  inputId="reviewer-response-file"
                  accept={ACCEPT_MANUSCRIPT}
                  disabled={uploading}
                  uploading={uploading}
                  onFile={(file) => void handleFileUpload(file)}
                  ariaLabel={t('uploadLabel')}
                  className="mt-3"
                >
                  <label
                    htmlFor="reviewer-response-file"
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-ink/20 bg-paper/50 px-4 py-3 text-sm font-medium text-accent transition-colors hover:bg-paper ${
                      uploading ? 'pointer-events-none opacity-50' : ''
                    }`}
                  >
                    {uploading ? (
                      <Spinner className="size-4" aria-hidden />
                    ) : (
                      <Plus className="size-4" aria-hidden />
                    )}
                    {t('uploadLabel')}
                  </label>
                </FileDropZone>
              </div>

              {sub?.slug ? (
                <Link
                  href={`/submissions/${encodeURIComponent(sub.slug)}`}
                  className="mt-8 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
                >
                  {t('viewFullManuscript')}
                  <span aria-hidden>→</span>
                </Link>
              ) : null}
            </section>

            {/* Section 4: Review Discussions */}
            <section
              className="rounded-xl border border-ink/10 bg-surface p-6 shadow-sm sm:p-8"
              aria-labelledby="discussions-heading"
            >
              <h2
                id="discussions-heading"
                className="font-sans text-xs font-semibold uppercase tracking-wider text-ink/50"
              >
                {t('discussionsSection')}
              </h2>

              {discussions.length === 0 && !showNewDiscussion && (
                <p className="mt-4 text-sm text-ink/50">{t('noDiscussions')}</p>
              )}

              {discussions.length > 0 && (
                <ul className="mt-4 space-y-3">
                  {discussions.map((disc) => {
                    const isExpanded = expandedDiscussionId === disc.id;
                    const lastMsg = disc.messages[disc.messages.length - 1];
                    return (
                      <li
                        key={disc.id}
                        className="rounded-lg border border-ink/10 bg-paper/50"
                      >
                        <button
                          type="button"
                          className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
                          onClick={() =>
                            setExpandedDiscussionId(isExpanded ? null : disc.id)
                          }
                          aria-expanded={isExpanded}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-ink">
                              {disc.subject || t('noSubject')}
                            </span>
                            {!isExpanded && lastMsg && (
                              <span className="mt-0.5 block truncate text-xs text-ink/50">
                                {lastMsg.author?.displayName ?? '—'}:{' '}
                                {lastMsg.body}
                              </span>
                            )}
                          </span>
                          {isExpanded ? (
                            <ChevronUp
                              className="mt-0.5 size-4 shrink-0 text-ink/40"
                              aria-hidden
                            />
                          ) : (
                            <ChevronDown
                              className="mt-0.5 size-4 shrink-0 text-ink/40"
                              aria-hidden
                            />
                          )}
                        </button>
                        {isExpanded && (
                          <div className="border-t border-ink/8 px-4 pb-4">
                            <ul className="mt-3 space-y-3">
                              {disc.messages.map((msg) => (
                                <li key={msg.id} className="text-sm">
                                  <span className="font-semibold text-ink">
                                    {msg.author?.displayName ?? '—'}
                                  </span>
                                  <span className="ms-2 text-xs text-ink/45">
                                    {new Date(msg.createdAt).toLocaleDateString(
                                      undefined,
                                      {
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric',
                                      },
                                    )}
                                  </span>
                                  <p className="mt-1 whitespace-pre-wrap text-ink/80">
                                    {msg.body}
                                  </p>
                                </li>
                              ))}
                            </ul>
                            <div className="mt-4">
                              <textarea
                                rows={3}
                                placeholder={t('reply') + '…'}
                                value={replyBodies[disc.id] ?? ''}
                                onChange={(e) =>
                                  setReplyBodies((prev) => ({
                                    ...prev,
                                    [disc.id]: e.target.value,
                                  }))
                                }
                                className={cn(
                                  'w-full resize-y rounded-lg border border-ink/15 bg-surface px-3 py-2 text-sm text-ink',
                                  'outline-none focus-visible:border-accent/40 focus-visible:ring-2 focus-visible:ring-accent/30',
                                )}
                              />
                              <Button
                                size="sm"
                                className="mt-2"
                                loading={submittingReply === disc.id}
                                onClick={() => void submitReply(disc.id)}
                              >
                                {t('sendMessage')}
                              </Button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {showNewDiscussion ? (
                <div className="mt-4 rounded-lg border border-ink/10 bg-paper/50 p-4">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                      {t('subject')}
                    </span>
                    <input
                      type="text"
                      value={newDiscSubject}
                      onChange={(e) => setNewDiscSubject(e.target.value)}
                      maxLength={500}
                      className={cn(
                        'rounded-lg border border-ink/15 bg-surface px-3 py-2 text-sm text-ink',
                        'outline-none focus-visible:border-accent/40 focus-visible:ring-2 focus-visible:ring-accent/30',
                      )}
                    />
                  </label>
                  <label className="mt-3 flex flex-col gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                      {t('discussionBody')}
                    </span>
                    <textarea
                      rows={4}
                      value={newDiscBody}
                      onChange={(e) => setNewDiscBody(e.target.value)}
                      className={cn(
                        'resize-y rounded-lg border border-ink/15 bg-surface px-3 py-2 text-sm text-ink',
                        'outline-none focus-visible:border-accent/40 focus-visible:ring-2 focus-visible:ring-accent/30',
                      )}
                    />
                  </label>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      loading={submittingDiscussion}
                      onClick={() => void submitNewDiscussion()}
                    >
                      {t('sendMessage')}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={submittingDiscussion}
                      onClick={() => setShowNewDiscussion(false)}
                    >
                      {tCommon('cancel')}
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowNewDiscussion(true)}
                  className="mt-4 flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
                >
                  <Plus className="size-4" aria-hidden />
                  {t('startDiscussion')}
                </button>
              )}
            </section>

            {/* Section 5 + form: Recommendations + Comments */}
            <section
              className="rounded-xl border border-ink/10 bg-surface p-6 shadow-sm sm:p-8"
              aria-labelledby="review-form-heading"
            >
              <h2
                id="review-form-heading"
                className="font-serif text-xl font-semibold text-ink"
              >
                {t('formSection')}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink/65">
                {commentsOptional
                  ? t('commentsOptionalOnAccept')
                  : t('commentsRequiredOnRejectOrRevisions')}
              </p>

              <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-8">
                {submitError && (
                  <div
                    className="flex gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
                    role="alert"
                  >
                    <span className="mt-0.5 shrink-0 text-red-600" aria-hidden>
                      <CircleX className="size-5" aria-hidden />
                    </span>
                    <span>{submitError}</span>
                  </div>
                )}

                <fieldset className="min-w-0 border-0 p-0">
                  <legend className="text-sm font-semibold text-ink">
                    {t('recommendation')}
                  </legend>
                  <div
                    className="mt-3 flex flex-col gap-3"
                    role="radiogroup"
                    aria-label={t('recommendation')}
                  >
                    {recs.map((r) => {
                      const id = `${recGroupId}-${r}`;
                      return (
                        <label
                          key={r}
                          htmlFor={id}
                          className={cn(
                            'relative cursor-pointer rounded-lg border border-ink/12 bg-paper/80 p-4 transition-colors',
                            'has-focus-visible:ring-2 has-focus-visible:ring-accent/35 has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-white',
                            recommendation === r &&
                              'border-accent/35 bg-accent/5 ring-2 ring-accent/25',
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
                                {recLabel(r)}
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
                    {t('commentsForAuthor')}
                  </span>
                  <span className="text-xs text-ink/60">
                    {t('commentsForAuthorHint')}
                  </span>
                  <textarea
                    rows={8}
                    value={commentsForAuthor}
                    onChange={(e) => setCommentsForAuthor(e.target.value)}
                    className={cn(
                      'resize-y rounded-lg border border-ink/15 bg-surface px-3 py-3 text-sm leading-relaxed text-ink',
                      'outline-none focus-visible:border-accent/40 focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
                    )}
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-ink">
                    {t('commentsToEditorOnly')}
                  </span>
                  <span className="text-xs text-ink/60">
                    {t('commentsToEditorOnlyHint')}
                  </span>
                  <textarea
                    rows={6}
                    value={commentsToEditorOnly}
                    onChange={(e) => setCommentsToEditorOnly(e.target.value)}
                    className={cn(
                      'resize-y rounded-lg border border-ink/15 bg-surface px-3 py-3 text-sm leading-relaxed text-ink',
                      'outline-none focus-visible:border-accent/40 focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
                    )}
                  />
                </label>

                <Button
                  type="submit"
                  loading={submitting}
                  aria-label={submitting ? t('sending') : undefined}
                  className="min-w-[7rem] py-3"
                >
                  {t('submit')}
                </Button>
              </form>
            </section>
          </div>
        </>
      )}
    </main>
  );
}
