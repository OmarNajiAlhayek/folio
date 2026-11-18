'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiJson } from '@/lib/api';
import { useToastApiError } from '@/lib/use-toast-api-error';
import {
  BlockingSection,
  GrammarSection,
} from '@/components/manuscript-validation/ManuscriptValidationPanel';

type GrammarNote = {
  excerpt: string;
  suggestion: string;
  rule: string;
  offset: number;
  length: number;
};

type AnalysisResult = {
  formatIssues: string[];
  grammarNotes: GrammarNote[];
  grammarUnavailable?: boolean;
  referenceIssues: string[];
  aiUnavailable: boolean;
};

export function CopyeditAiPanel({
  assignmentSlug,
}: {
  assignmentSlug: string;
}) {
  const t = useTranslations('CopyeditAi');
  const tv = useTranslations('ManuscriptValidation');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [running, setRunning] = useState(false);
  const showApiError = useToastApiError();

  async function runAnalysis() {
    setRunning(true);
    try {
      const data = await apiJson<AnalysisResult>(
        `/copyedit-assignments/${assignmentSlug}/ai-analysis`,
        { method: 'POST' },
      );
      setResult(data);
    } catch (err) {
      showApiError(err, t('loadFailed'), { id: 'copyedit-ai-analysis' });
    } finally {
      setRunning(false);
    }
  }

  const hasBlocking =
    Boolean(result) &&
    (result!.formatIssues.length > 0 || result!.referenceIssues.length > 0);
  const allClear =
    Boolean(result) &&
    !hasBlocking &&
    result!.grammarNotes.length === 0 &&
    result!.grammarUnavailable !== true &&
    !result!.aiUnavailable;

  return (
    <section className="mt-8 rounded-xl border border-ink/10 bg-paper/50 p-6 shadow-sm dark:border-white/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-sans text-lg font-semibold text-ink">
            {t('sectionTitle')}
          </h2>
          <p className="mt-0.5 text-xs text-ink/55">{t('sectionHint')}</p>
        </div>
        <button
          type="button"
          disabled={running}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={() => void runAnalysis()}
        >
          {running
            ? t('running')
            : result
              ? tv('rerunButton')
              : t('runButton')}
        </button>
      </div>

      {allClear ? (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200">
          {t('allClear')}
        </p>
      ) : null}

      {result ? (
        <div className="mt-5 space-y-3">
          <BlockingSection
            title={t('formatTitle')}
            issues={result.formatIssues}
          />
          <BlockingSection
            title={t('referencesTitle')}
            issues={result.referenceIssues}
            isUnavailable={
              result.aiUnavailable && result.referenceIssues.length === 0
            }
            unavailableNote={t('aiUnavailableNote')}
          />
          <GrammarSection
            title={t('grammarTitle')}
            notes={result.grammarNotes}
            unavailable={result.grammarUnavailable === true}
          />
        </div>
      ) : (
        <p className="mt-4 text-xs text-ink/55">{t('notRunHint')}</p>
      )}
    </section>
  );
}
