'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { apiJson } from '@/lib/api';
import { Spinner } from '@/components/ui/spinner';
import { CollapsibleSection } from '@/components/ui/collapsible-section';

export type CorpusSimilaritySource = {
  articleId: string;
  maxSimilarity: number;
  snippets: Array<{
    submissionSnippet: string;
    matchedSnippet: string;
    similarity: number;
  }>;
  publication?: { slug: string; title: string; titleAr: string | null };
  indexedOnly?: boolean;
};

export type WebSimilaritySource = {
  sourceUrl: string;
  maxSimilarity: number;
  snippets: Array<{
    querySnippet: string;
    matchedSnippet: string;
    similarity: number;
  }>;
};

type StageReport<T> = {
  enabled: boolean;
  threshold: number;
  matchCount: number;
  sources: T[];
  error?: string;
};

export type CorpusSimilarityReport =
  | { status: 'unavailable' }
  | { status: 'no_text' }
  | {
      status: 'ok';
      local: StageReport<CorpusSimilaritySource> | null;
      web: StageReport<WebSimilaritySource> | null;
    };

type AiJobResponse = {
  jobId: string;
  jobType: string;
  status: 'pending' | 'queued' | 'running' | 'completed' | 'failed';
  result?: CorpusSimilarityReport;
  errorMessage?: string | null;
  completedAt?: string | null;
};

type Props = {
  slug: string;
};

const POLL_MS = 1_500;
const POLL_MAX_MS = 600_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isImmediateReport(
  body: AiJobResponse | CorpusSimilarityReport,
): body is CorpusSimilarityReport {
  return 'status' in body && !('jobId' in body);
}

function formatLocalPercent(similarity: number): string {
  return `${Math.round(similarity * 100)}%`;
}

function formatWebPercent(similarity: number): string {
  return `${Math.round(similarity)}%`;
}

function localSimilarityBadgeCls(
  similarity: number,
  threshold: number,
): string {
  if (similarity >= threshold) {
    return 'font-mono text-xs font-semibold px-2 py-0.5 rounded-full text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30';
  }
  if (similarity >= threshold * 0.7) {
    return 'font-mono text-xs font-semibold px-2 py-0.5 rounded-full text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30';
  }
  return 'font-mono text-xs text-ink/55';
}

function webSimilarityBadgeCls(similarity: number, threshold: number): string {
  if (similarity >= threshold) {
    return 'font-mono text-xs font-semibold px-2 py-0.5 rounded-full text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30';
  }
  if (similarity >= threshold * 0.7) {
    return 'font-mono text-xs font-semibold px-2 py-0.5 rounded-full text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30';
  }
  return 'font-mono text-xs text-ink/55';
}

export function CorpusSimilarityPanel({ slug }: Props) {
  const t = useTranslations('SubmissionDetail');
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<CorpusSimilarityReport | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [error, setError] = useState('');
  const pollAbortRef = useRef<AbortController | null>(null);

  const applyReport = useCallback(
    (data: CorpusSimilarityReport | null, completedAt?: string | null) => {
      setReport(data);
      setCheckedAt(completedAt ?? new Date().toISOString());
    },
    [],
  );

  const pollJobUntilDone = useCallback(
    async (jobId: string, signal: AbortSignal) => {
      const started = Date.now();
      while (!signal.aborted) {
        const job = await apiJson<AiJobResponse>(
          `/submissions/${encodeURIComponent(slug)}/corpus-similarity/jobs/${encodeURIComponent(jobId)}`,
          { signal },
        );
        if (job.status === 'completed' && job.result) {
          applyReport(job.result, job.completedAt);
          return;
        }
        if (job.status === 'failed') {
          throw new Error(job.errorMessage ?? 'job_failed');
        }
        if (Date.now() - started >= POLL_MAX_MS) {
          throw new Error('timeout');
        }
        await sleep(POLL_MS);
      }
    },
    [slug, applyReport],
  );

  const load = useCallback(async () => {
    pollAbortRef.current?.abort();
    const controller = new AbortController();
    pollAbortRef.current = controller;

    setLoading(true);
    setError('');
    try {
      const latest = await apiJson<AiJobResponse | null>(
        `/submissions/${encodeURIComponent(slug)}/corpus-similarity/jobs/latest`,
        { signal: controller.signal },
      );
      if (
        latest &&
        (latest.status === 'pending' ||
          latest.status === 'queued' ||
          latest.status === 'running')
      ) {
        await pollJobUntilDone(latest.jobId, controller.signal);
        return;
      }
      if (latest?.status === 'completed' && latest.result) {
        applyReport(latest.result, latest.completedAt);
        return;
      }

      const started = await apiJson<AiJobResponse | CorpusSimilarityReport>(
        `/submissions/${encodeURIComponent(slug)}/corpus-similarity/jobs`,
        { method: 'POST', signal: controller.signal },
      );
      if (isImmediateReport(started)) {
        applyReport(started);
        return;
      }
      await pollJobUntilDone(started.jobId, controller.signal);
    } catch {
      if (controller.signal.aborted) return;
      setError(t('corpusSimilarityLoadFailed'));
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [slug, t, applyReport, pollJobUntilDone]);

  const runAgain = useCallback(async () => {
    pollAbortRef.current?.abort();
    const controller = new AbortController();
    pollAbortRef.current = controller;

    setLoading(true);
    setError('');
    setReport(null);
    setCheckedAt(null);
    try {
      const started = await apiJson<AiJobResponse | CorpusSimilarityReport>(
        `/submissions/${encodeURIComponent(slug)}/corpus-similarity/jobs`,
        { method: 'POST', signal: controller.signal },
      );
      if (isImmediateReport(started)) {
        applyReport(started);
        return;
      }
      await pollJobUntilDone(started.jobId, controller.signal);
    } catch {
      if (controller.signal.aborted) return;
      setError(t('corpusSimilarityLoadFailed'));
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [slug, t, applyReport, pollJobUntilDone]);

  useEffect(() => {
    return () => {
      pollAbortRef.current?.abort();
    };
  }, []);

  const onToggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && report === null && !loading) {
      void load();
    }
  };

  const localStage = report?.status === 'ok' ? report.local : null;
  const webStage = report?.status === 'ok' ? report.web : null;
  const hasLocalMatches = localStage != null && localStage.sources.length > 0;
  const hasWebMatches = webStage != null && webStage.sources.length > 0;
  const allClear =
    report?.status === 'ok' &&
    !hasLocalMatches &&
    !hasWebMatches &&
    !localStage?.error &&
    !webStage?.error;

  const checkedAtLabel = checkedAt
    ? t('corpusSimilarityCheckedAt', {
        time: new Date(checkedAt).toLocaleString(locale, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
      })
    : null;

  return (
    <div
      data-testid="corpus-similarity-panel"
      className="rounded-lg border border-ink/10 bg-paper/30 px-4 py-4 dark:border-white/10"
    >
      <button
        type="button"
        data-testid="corpus-similarity-toggle"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 text-start"
        aria-expanded={expanded}
      >
        <span className="text-sm font-semibold text-ink">
          {t('corpusSimilarityTitle')}
        </span>
        <span className="text-xs text-ink/50">{expanded ? '−' : '+'}</span>
      </button>

      <CollapsibleSection
        open={expanded}
        slide={false}
        contentClassName="mt-3 space-y-3"
      >
        <p className="text-xs leading-relaxed text-ink/60">
          {t('corpusSimilarityDisclaimer')}
        </p>

        {loading && (
          <div
            data-testid="corpus-similarity-loading"
            className="flex items-center gap-2 text-sm text-ink/60"
          >
            <Spinner className="size-4" />
            {t('corpusSimilarityLoading')}
          </div>
        )}

        {error && <p className="text-sm text-red-700">{error}</p>}

        {!loading && !error && report?.status === 'unavailable' && (
          <p
            data-testid="corpus-similarity-unavailable"
            className="text-sm text-ink/65"
          >
            {t('corpusSimilarityUnavailable')}
          </p>
        )}

        {!loading && !error && report?.status === 'no_text' && (
          <p
            data-testid="corpus-similarity-no-text"
            className="text-sm text-ink/65"
          >
            {t('corpusSimilarityNoText')}
          </p>
        )}

        {!loading && !error && allClear && (
          <p
            data-testid="corpus-similarity-clear"
            className="text-sm text-ink/65"
          >
            {t('corpusSimilarityClear')}
          </p>
        )}

        {!loading && !error && report?.status === 'ok' && (
          <div data-testid="corpus-similarity-result" className="space-y-6">
            {checkedAtLabel && (
              <p
                data-testid="corpus-similarity-checked-at"
                className="text-xs text-ink/45"
              >
                {checkedAtLabel}
              </p>
            )}

            {localStage === null && (
              <p className="text-sm text-ink/65">
                {t('corpusSimilarityLocalNotConfigured')}
              </p>
            )}
            {localStage?.error && (
              <p className="text-sm text-amber-800 dark:text-amber-200">
                {t('corpusSimilarityLocalError')}
              </p>
            )}
            {localStage != null && (
              <section
                data-testid="corpus-similarity-local-section"
                className="space-y-3"
              >
                <h3 className="text-sm font-semibold text-ink">
                  {t('corpusSimilarityLocalTitle')}
                </h3>
                {localStage.sources.length === 0 && !localStage.error && (
                  <p className="text-sm text-ink/65">
                    {t('corpusSimilarityLocalClear')}
                  </p>
                )}
                {localStage.sources.length > 0 && (
                  <ul className="space-y-4">
                    {localStage.sources.map((src) => {
                      const title =
                        locale === 'ar' && src.publication?.titleAr
                          ? src.publication.titleAr
                          : src.publication?.title;
                      return (
                        <li
                          key={src.articleId}
                          data-testid="corpus-similarity-source"
                          className="rounded-md border border-ink/10 bg-surface/80 p-3 dark:border-white/10"
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            {src.publication?.slug ? (
                              <Link
                                href={`/publications/${src.publication.slug}`}
                                className="text-sm font-semibold text-accent hover:underline"
                              >
                                {title ?? src.publication.slug}
                              </Link>
                            ) : (
                              <span className="text-sm font-semibold text-ink">
                                {src.indexedOnly
                                  ? t('corpusSimilarityIndexedOnly')
                                  : src.articleId}
                              </span>
                            )}
                            <span
                              className={localSimilarityBadgeCls(
                                src.maxSimilarity,
                                localStage.threshold,
                              )}
                            >
                              {t('corpusSimilarityMax', {
                                percent: formatLocalPercent(src.maxSimilarity),
                              })}
                            </span>
                          </div>
                          <ul className="mt-2 space-y-2">
                            {src.snippets.map((sn, i) => (
                              <li key={i} className="text-xs text-ink/70">
                                <p dir="auto" className="line-clamp-2">
                                  <span className="font-medium text-ink/50">
                                    {t('corpusSimilaritySubmissionBit')}:{' '}
                                  </span>
                                  {sn.submissionSnippet}
                                </p>
                                <p dir="auto" className="mt-1 line-clamp-2">
                                  <span className="font-medium text-ink/50">
                                    {t('corpusSimilarityCorpusBit')}:{' '}
                                  </span>
                                  {sn.matchedSnippet}
                                </p>
                              </li>
                            ))}
                          </ul>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            )}

            {webStage === null && (
              <p
                data-testid="corpus-similarity-web-not-configured"
                className="text-sm text-ink/65"
              >
                {t('corpusSimilarityWebNotConfigured')}
              </p>
            )}
            {webStage?.error && (
              <p
                data-testid="corpus-similarity-web-error"
                className="text-sm text-amber-800 dark:text-amber-200"
              >
                {t('corpusSimilarityWebError')}
              </p>
            )}
            {webStage != null && (
              <section
                data-testid="corpus-similarity-web-section"
                className="space-y-3"
              >
                <h3 className="text-sm font-semibold text-ink">
                  {t('corpusSimilarityWebTitle')}
                </h3>
                <p className="text-xs leading-relaxed text-ink/60">
                  {t('corpusSimilarityWebDisclaimer')}
                </p>
                {webStage.sources.length === 0 && !webStage.error && (
                  <p className="text-sm text-ink/65">
                    {t('corpusSimilarityWebClear')}
                  </p>
                )}
                {webStage.sources.length > 0 && (
                  <ul className="space-y-4">
                    {webStage.sources.map((src) => (
                      <li
                        key={src.sourceUrl}
                        data-testid="corpus-similarity-source"
                        className="rounded-md border border-ink/10 bg-surface/80 p-3 dark:border-white/10"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <a
                            href={src.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="break-all text-sm font-semibold text-accent hover:underline"
                          >
                            {src.sourceUrl}
                          </a>
                          <span
                            className={webSimilarityBadgeCls(
                              src.maxSimilarity,
                              webStage.threshold,
                            )}
                          >
                            {t('corpusSimilarityMax', {
                              percent: formatWebPercent(src.maxSimilarity),
                            })}
                          </span>
                        </div>
                        <ul className="mt-2 space-y-2">
                          {src.snippets.map((sn, i) => (
                            <li key={i} className="text-xs text-ink/70">
                              <p dir="auto" className="line-clamp-2">
                                <span className="font-medium text-ink/50">
                                  {t('corpusSimilaritySubmissionBit')}:{' '}
                                </span>
                                {sn.querySnippet}
                              </p>
                              <p dir="auto" className="mt-1 line-clamp-2">
                                <span className="font-medium text-ink/50">
                                  {t('corpusSimilarityWebBit')}:{' '}
                                </span>
                                {sn.matchedSnippet}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            <div className="pt-1">
              <button
                type="button"
                data-testid="corpus-similarity-run-again"
                onClick={() => void runAgain()}
                className="text-xs font-medium text-accent/70 hover:text-accent transition-colors"
              >
                {t('corpusSimilarityRunAgain')}
              </button>
            </div>
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}
