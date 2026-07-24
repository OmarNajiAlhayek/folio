'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { apiJson } from '@/lib/api';
import { Spinner } from '@/components/ui/spinner';
import { CollapsibleSection } from '@/components/ui/collapsible-section';

export type SectionEditorSuggestionsReport =
  | { status: 'no_disciplines' }
  | { status: 'no_candidates' }
  | {
      status: 'ok';
      suggestions: Array<{
        userId: string;
        displayName: string;
        email: string;
        matchingDisciplines: string[];
        activeAssignmentCount: number;
      }>;
    };

type Props = {
  slug: string;
  disabled?: boolean;
  onPick: (sectionEditorId: string) => void;
};

export function SectionEditorSuggestionsPanel({
  slug,
  disabled,
  onPick,
}: Props) {
  const t = useTranslations('SubmissionDetail');
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<SectionEditorSuggestionsReport | null>(
    null,
  );
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiJson<SectionEditorSuggestionsReport>(
        `/submissions/${encodeURIComponent(slug)}/suggested-section-editors`,
      );
      setReport(data);
    } catch {
      setError(t('suggestSectionEditorsLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [slug, t]);

  const onToggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && report === null && !loading) {
      void load();
    }
  };

  return (
    <div className="rounded-lg border border-ink/10 bg-paper/20 px-3 py-3 dark:border-white/10">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className="flex w-full items-center justify-between gap-2 text-start disabled:opacity-50"
        aria-expanded={expanded}
      >
        <span className="text-[11px] font-semibold text-ink/70">
          {t('suggestSectionEditorsTitle')}
        </span>
        <span className="text-xs text-ink/50">{expanded ? '−' : '+'}</span>
      </button>

      <CollapsibleSection
        open={expanded}
        slide={false}
        contentClassName="mt-3 space-y-2"
      >
        <p className="text-[10px] text-ink/50">
          {t('suggestSectionEditorsHint')}
        </p>
        {loading && (
          <div className="flex items-center gap-2 text-[10px] text-ink/60">
            <Spinner className="h-3 w-3" />
            {t('suggestSectionEditorsLoading')}
          </div>
        )}
        {error && <p className="text-[10px] text-red-600">{error}</p>}
        {report?.status === 'no_disciplines' && (
          <p className="text-[10px] text-ink/50">
            {t('suggestSectionEditorsNoDisciplines')}
          </p>
        )}
        {report?.status === 'no_candidates' && (
          <p className="text-[10px] text-ink/50">
            {t('suggestSectionEditorsNoCandidates')}
          </p>
        )}
        {report?.status === 'ok' && report.suggestions.length === 0 && (
          <p className="text-[10px] text-ink/50">
            {t('suggestSectionEditorsNoCandidates')}
          </p>
        )}
        {report?.status === 'ok' && report.suggestions.length > 0 && (
          <ul className="space-y-2">
            {report.suggestions.map((row) => (
              <li
                key={row.userId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ink/10 bg-paper/60 px-2 py-2 dark:border-white/10"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-ink">
                    {row.displayName}
                  </p>
                  <p className="truncate text-[10px] text-ink/50">
                    {row.email}
                  </p>
                  {row.matchingDisciplines.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {row.matchingDisciplines.map((d) => (
                        <span
                          key={d}
                          className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[9px] font-medium text-accent"
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="mt-0.5 text-[10px] text-ink/60">
                    {t('suggestSectionEditorsWorkload', {
                      count: row.activeAssignmentCount,
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onPick(row.userId)}
                  className="shrink-0 rounded-lg border border-ink/15 px-2 py-1 text-[10px] font-semibold text-ink hover:bg-ink/5 disabled:opacity-50 dark:border-white/15"
                >
                  {t('suggestSectionEditorsUse')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>
    </div>
  );
}
