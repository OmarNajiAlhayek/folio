'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { useParams } from 'next/navigation';
import { apiJson, ApiError } from '@/lib/api';
import { ApiErrorState } from '@/components/api-error-state';
import { redirectToLogin } from '@/lib/auth-redirect';
import { useApiErrorMessages } from '@/lib/use-api-error-messages';
import { toast } from '@/lib/toast';
import { useToastApiError } from '@/lib/use-toast-api-error';
import { PAGE_SHELL } from '@/lib/page-shell';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';

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
  const t = useTranslations('AssignmentsInvite');
  const tAssignments = useTranslations('Assignments');
  const tWf = useTranslations('SubmissionWorkflow');
  const params = useParams();
  const slug = params.slug as string;
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<AssignmentRow | null>(null);
  const [abstractExpandedEn, setAbstractExpandedEn] = useState(false);
  const [abstractExpandedAr, setAbstractExpandedAr] = useState(false);
  const [acting, setActing] = useState(false);
  const [errorCause, setErrorCause] = useState<unknown>(null);
  const { resolve: resolveApiError } = useApiErrorMessages();
  const tApi = useTranslations('ApiErrors');
  const showApiError = useToastApiError();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setErrorCause(null);
    setAssignment(null);
    try {
      const row = await apiJson<AssignmentRow>(
        `/assignments/${encodeURIComponent(slug)}`,
      );
      if (row.status !== 'invited') {
        setError(t('notInvited'));
        return;
      }
      setAssignment(row);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        redirectToLogin(router, pathname);
        return;
      }
      if (err instanceof ApiError && err.status === 403) {
        setError(
          err.code === 'FORBIDDEN'
            ? t('wrongReviewerAccount')
            : tAssignments('needReviewerRole'),
        );
        setErrorCause(err);
        return;
      }
      if (err instanceof ApiError && err.status === 404) {
        try {
          const items = await apiJson<AssignmentRow[]>('/assignments/me');
          const invited = items.filter(
            (a) =>
              a.status === 'invited' &&
              typeof a.slug === 'string' &&
              a.slug.length > 0,
          );
          if (invited.length === 1 && invited[0].slug !== slug) {
            toast.info(t('staleLinkRedirect'), {
              id: 'assignment-invite-stale-link',
            });
            router.replace(
              `/assignments/${encodeURIComponent(invited[0].slug!)}/invite`,
            );
            return;
          }
          if (invited.length === 0) {
            setError(t('notFoundReLogin'));
            setErrorCause(err);
            return;
          }
          if (invited.length > 1) {
            setError(t('notFoundManyInvites'));
            setErrorCause(err);
            return;
          }
        } catch {
          /* fall through */
        }
        setError(t('notFound'));
        setErrorCause(err);
        return;
      }
      setErrorCause(err);
      setError(resolveApiError(err, t('loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [slug, router, pathname, t, tAssignments, resolveApiError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function accept() {
    setActing(true);
    try {
      await apiJson(`/assignments/${encodeURIComponent(slug)}/accept`, {
        method: 'POST',
      });
      toast.success(t('acceptSuccess'), {
        id: 'assignment-invite-accept-success',
      });
      router.push(`/assignments/${encodeURIComponent(slug)}/review`);
    } catch (err) {
      showApiError(err, t('actionFailed'), { id: 'assignment-invite-accept' });
    } finally {
      setActing(false);
    }
  }

  async function decline() {
    setActing(true);
    try {
      await apiJson(`/assignments/${encodeURIComponent(slug)}/decline`, {
        method: 'POST',
      });
      toast.success(t('declineSuccess'), {
        id: 'assignment-invite-decline-success',
      });
      router.push('/assignments');
    } catch (err) {
      showApiError(err, t('actionFailed'), { id: 'assignment-invite-decline' });
    } finally {
      setActing(false);
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

  return (
    <main className={PAGE_SHELL}>
      <Link
        href="/assignments"
        className="text-sm font-medium text-accent hover:underline"
      >
        {t('back')}
      </Link>

      {loading && (
        <div className="mt-8 animate-pulse space-y-4">
          <div className="h-8 w-2/3 max-w-md rounded bg-ink/10" />
          <div className="h-24 rounded-xl border border-ink/10 bg-surface" />
        </div>
      )}

      {!loading && error && (
        <div className="mt-8">
          <ApiErrorState
            className="max-w-none px-0 py-0"
            message={error}
            error={errorCause}
            onRetry={() => void load()}
            retryLabel={tApi('retry')}
            backHref="/assignments"
            backLabel={t('backToAssignments')}
          />
        </div>
      )}

      {!loading && !error && assignment && (
        <>
          <p className="mt-6 font-sans text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            {t('eyebrow')}
          </p>
          <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            {t('title')}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink/70">
            {t('hint')}
          </p>

          <section className="mt-10 rounded-xl border border-ink/10 bg-surface p-6 shadow-sm sm:p-8">
            <h2 className="font-sans text-xs font-semibold uppercase tracking-wider text-ink/50">
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
            {hasAnyAbstract ? (
              <div className="mt-4 space-y-6">
                {abstractEn ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                      {tWf('abstractLabelEn')}
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
                          ? t('showLessAbstract')
                          : t('showMoreAbstract')}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-4 text-sm text-ink/55">{t('noAbstract')}</p>
            )}
            <p className="mt-6 text-xs text-ink/50">
              {t('fullManuscriptAfterAccept')}
            </p>
          </section>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              loading={acting}
              aria-label={acting ? t('working') : undefined}
              onClick={() => void accept()}
              className="min-w-[7rem]"
            >
              {t('accept')}
            </Button>
            <Button
              variant="secondary"
              disabled={acting}
              onClick={() => void decline()}
            >
              {t('decline')}
            </Button>
          </div>
        </>
      )}
    </main>
  );
}
