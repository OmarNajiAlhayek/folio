'use client';

import { useTranslations } from 'next-intl';

import { useCallback, useEffect, useState } from 'react';

import { Link, usePathname, useRouter } from '@/i18n/navigation';

import { useParams } from 'next/navigation';

import { apiJson, ApiError } from '@/lib/api';

import { ApiErrorState } from '@/components/api-error-state';

import { getApiErrorKind } from '@/lib/api-error-message';

import { redirectToLogin } from '@/lib/auth-redirect';

import { useApiErrorMessages } from '@/lib/use-api-error-messages';

import { toast } from '@/lib/toast';

import { useToastApiError } from '@/lib/use-toast-api-error';

import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonLoadingStatus } from '@/components/ui/skeleton-loading-status';
import { submissionQueueShellCls } from '@/lib/submission-list-ui';
import { CopyeditAiPanel } from '@/components/copyedit/CopyeditAiPanel';
import { PublishIssuePicker } from '@/components/copyedit/PublishIssuePicker';

type NoteRow = {
  id: string;

  round: number;

  noteForAuthor: string;

  noteToEditorOnly?: string;

  submittedAt: string;
};

type AssignmentDetail = {
  id: string;

  slug: string | null;

  status: string;

  notes: NoteRow[];

  submission?: {
    slug: string;

    title: string;

    status: string;

    files?: Array<{ id: string; originalName: string }>;
  };
};

function CopyeditDetailSkeleton() {
  const t = useTranslations('Copyedit');
  return (
    <main className={submissionQueueShellCls} aria-busy="true">
      <SkeletonLoadingStatus label={t('loading')} />
      <Skeleton className="h-4 w-28" />
      <div className="mt-4 border-s-4 border-s-accent/35 ps-5 space-y-2">
        <Skeleton className="h-7 w-3/4 max-w-lg rounded-xl" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="mt-2 h-4 w-36" />
      <div className="mt-6 space-y-3">
        <Skeleton className="h-3 w-24" />
        {[1, 2].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-ink/10 bg-paper/60 p-4 space-y-2"
          >
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ))}
      </div>
      <div className="mt-8 rounded-xl border border-ink/10 p-6 space-y-4">
        <Skeleton className="h-5 w-28 rounded-xl" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
    </main>
  );
}

export default function CopyeditWorkbenchPage() {
  const t = useTranslations('Copyedit');

  const tApi = useTranslations('ApiErrors');

  const params = useParams();

  const assignmentSlug = String(params.slug ?? '');

  const pathname = usePathname();

  const router = useRouter();

  const { resolve: resolveApiError } = useApiErrorMessages();

  const [row, setRow] = useState<AssignmentDetail | null>(null);

  const [noteForAuthor, setNoteForAuthor] = useState('');

  const [noteToEditor, setNoteToEditor] = useState('');

  const [busy, setBusy] = useState(false);
  const [publishIssueId, setPublishIssueId] = useState('');

  const [loading, setLoading] = useState(true);

  const [loadError, setLoadError] = useState<string | null>(null);

  const [loadErrorCause, setLoadErrorCause] = useState<unknown>(null);

  const showApiError = useToastApiError();

  const load = useCallback(async () => {
    setLoading(true);

    setLoadError(null);

    setLoadErrorCause(null);

    try {
      const items = await apiJson<AssignmentDetail[]>(
        '/copyedit-assignments/me',
      );

      const match = items.find((a) => a.slug === assignmentSlug);

      if (!match) {
        throw new ApiError('Not found', 'NOT_FOUND', 404);
      }

      setRow(match as AssignmentDetail);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        redirectToLogin(router, pathname);

        return;
      }

      setLoadErrorCause(err);

      setLoadError(resolveApiError(err, t('loadFailed')));

      setRow(null);
    } finally {
      setLoading(false);
    }
  }, [assignmentSlug, router, pathname, resolveApiError, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const canSubmitNote =
    row?.status === 'active' || row?.status === 'ready_for_review';

  const canPublish =
    row?.status === 'ready_for_review' &&
    row.submission?.status === 'copyediting';

  const canApproveReady =
    row?.status === 'active' && row.submission?.status === 'copyediting';

  async function submitNote() {
    if (!row?.slug) return;

    setBusy(true);

    try {
      await apiJson(`/copyedit-assignments/${row.slug}/notes`, {
        method: 'POST',

        body: JSON.stringify({
          noteForAuthor,

          noteToEditorOnly: noteToEditor || undefined,
        }),
      });

      toast.success(t('noteSent'));

      setNoteForAuthor('');

      setNoteToEditor('');

      await load();
    } catch (err) {
      showApiError(err, t('noteFailed'), { id: 'copyedit-assignment-note' });
    } finally {
      setBusy(false);
    }
  }

  async function approveReadyWithoutAuthor() {
    if (!row?.slug) return;
    setBusy(true);
    try {
      await apiJson(`/copyedit-assignments/${row.slug}/approve-ready`, {
        method: 'POST',
      });
      toast.success(t('approveReadySuccess'));
      await load();
    } catch (err) {
      showApiError(err, t('approveReadyFailed'), {
        id: 'copyedit-assignment-approve-ready',
      });
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    const subSlug = row?.submission?.slug;

    if (!subSlug || !publishIssueId) return;

    setBusy(true);

    try {
      await apiJson(`/submissions/${subSlug}/publish`, {
        method: 'POST',
        body: JSON.stringify({ issueId: publishIssueId }),
      });

      toast.success(t('published'));

      await load();
    } catch (err) {
      showApiError(err, t('publishFailed'), {
        id: 'copyedit-assignment-publish',
      });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <CopyeditDetailSkeleton />;
  }

  if (loadError) {
    return (
      <ApiErrorState
        className={submissionQueueShellCls}
        message={loadError}
        error={loadErrorCause}
        title={
          loadErrorCause && getApiErrorKind(loadErrorCause) === 'notFound'
            ? tApi('notFound')
            : undefined
        }
        hint={
          loadErrorCause && getApiErrorKind(loadErrorCause) === 'rateLimit'
            ? tApi('rateLimitHint')
            : undefined
        }
        onRetry={() => void load()}
        retryLabel={tApi('retry')}
        backHref="/copyedit-assignments"
        backLabel={t('backToQueue')}
      />
    );
  }

  if (!row) {
    return null;
  }

  const sub = row.submission;

  return (
    <main className={submissionQueueShellCls}>
      <nav className="text-sm">
        <Link
          href="/copyedit-assignments"
          className="text-accent hover:underline"
        >
          {t('backToQueue')}
        </Link>
      </nav>

      <header className="mt-4 border-s-4 border-s-accent/35 ps-5">
        <h1 className="font-serif text-2xl font-semibold text-ink">
          {sub?.title ?? t('submissionFallback')}
        </h1>

        <p className="mt-1 text-sm text-ink/65">
          {t(`assignmentStatus_${row.status}` as 'assignmentStatus_active')}
        </p>
      </header>

      {sub?.slug && (
        <p className="mt-2 text-sm">
          <Link
            href={`/submissions/${sub.slug}`}
            className="text-accent hover:underline"
          >
            {t('viewSubmission')}
          </Link>
        </p>
      )}

      {row.notes?.length > 0 && (
        <section className="mt-6 space-y-3">
          <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-ink/50">
            {t('queryHistory')}
          </h2>

          {[...row.notes]

            .sort((a, b) => b.round - a.round)

            .map((n) => (
              <article
                key={n.id}
                className="rounded-lg border border-ink/10 bg-paper/60 p-4"
              >
                <p className="text-xs text-ink/50">
                  {t('roundLabel', { round: String(n.round) })}
                </p>

                <p className="mt-2 whitespace-pre-wrap text-sm">
                  {n.noteForAuthor}
                </p>
              </article>
            ))}
        </section>
      )}

      {canSubmitNote && (
        <section className="mt-8 rounded-xl border border-ink/10 p-6">
          <h2 className="font-sans text-lg font-semibold">{t('newQuery')}</h2>

          <label className="mt-3 block text-sm font-medium">
            {t('noteForAuthor')}

            <textarea
              className="mt-1 w-full rounded-lg border border-ink/15 p-2 text-sm"
              rows={4}
              value={noteForAuthor}
              onChange={(e) => setNoteForAuthor(e.target.value)}
            />
          </label>

          <label className="mt-3 block text-sm font-medium">
            {t('noteToEditor')}

            <textarea
              className="mt-1 w-full rounded-lg border border-ink/15 p-2 text-sm"
              rows={2}
              value={noteToEditor}
              onChange={(e) => setNoteToEditor(e.target.value)}
            />
          </label>

          <button
            type="button"
            disabled={busy || !noteForAuthor.trim()}
            className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => void submitNote()}
          >
            {t('sendQuery')}
          </button>
        </section>
      )}

      {canApproveReady && (
        <section className="mt-6 rounded-xl border border-ink/10 bg-paper/40 p-4">
          <p className="text-sm text-ink/70">{t('approveReadyHint')}</p>
          <button
            type="button"
            disabled={busy}
            className="mt-3 rounded-lg border border-ink/20 bg-surface px-4 py-2 text-sm font-medium text-ink disabled:opacity-50"
            onClick={() => void approveReadyWithoutAuthor()}
          >
            {t('approveReadyButton')}
          </button>
        </section>
      )}

      {canPublish && row.submission?.slug && (
        <section className="mt-6">
          <PublishIssuePicker
            submissionSlug={row.submission.slug}
            value={publishIssueId}
            onValueChange={setPublishIssueId}
            disabled={busy}
          />
          <button
            type="button"
            disabled={busy || !publishIssueId}
            className="mt-3 rounded-lg border border-emerald-600 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-900 disabled:opacity-50"
            onClick={() => void publish()}
          >
            {t('publishButton')}
          </button>
        </section>
      )}

      {row.slug && <CopyeditAiPanel assignmentSlug={row.slug} />}
    </main>
  );
}
