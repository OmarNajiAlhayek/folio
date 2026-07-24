'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiJson } from '@/lib/api';
import { hashConstructorContent } from '@/lib/constructor-content-hash';
import type { PreSubmitAnalysis } from '@/lib/pre-submit-validation';
import { PRE_SUBMIT_VALIDATION_FIELD } from '@/lib/pre-submit-validation';
import { toast } from '@/lib/toast';
import { useToastApiError } from '@/lib/use-toast-api-error';
import { CollapsibleSection } from '@/components/ui/collapsible-section';

type GrammarNote = PreSubmitAnalysis['grammarNotes'][number];

function BlockingSection({
  title,
  issues,
  isUnavailable,
  unavailableNote,
}: {
  title: string;
  issues: string[];
  isUnavailable?: boolean;
  unavailableNote?: string;
}) {
  const t = useTranslations('ManuscriptValidation');
  const [open, setOpen] = useState(true);
  const hasIssues = issues.length > 0;

  return (
    <div className="rounded-lg border border-ink/10 bg-paper/60">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="font-sans text-sm font-semibold text-ink">
          {title}
        </span>
        <span className="flex items-center gap-2">
          {isUnavailable ? (
            <span className="rounded-full bg-ink/10 px-2 py-0.5 text-xs text-ink/55">
              {t('badgeUnavailable')}
            </span>
          ) : hasIssues ? (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-950/40 dark:text-red-300">
              {t('blockingLabel', { count: String(issues.length) })}
            </span>
          ) : (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              {t('passLabel')}
            </span>
          )}
          <span className="text-xs text-ink/40">{open ? '▲' : '▼'}</span>
        </span>
      </button>

      <CollapsibleSection
        open={open}
        slide={false}
        contentClassName="border-t border-ink/10 px-4 py-3"
      >
        {isUnavailable && unavailableNote ? (
          <p className="text-xs text-ink/55">{unavailableNote}</p>
        ) : issues.length === 0 ? (
          <p className="text-xs text-ink/55">{t('passLabel')}</p>
        ) : (
          <ul className="space-y-2">
            {issues.map((issue, i) => (
              <li
                key={i}
                className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-900 dark:bg-red-950/30 dark:text-red-200"
              >
                {issue}
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>
    </div>
  );
}

function GrammarSection({ notes }: { notes: GrammarNote[] }) {
  const t = useTranslations('ManuscriptValidation');
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-lg border border-ink/10 bg-paper/60">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="font-sans text-sm font-semibold text-ink">
          {t('languageTitle')}
        </span>
        <span className="flex items-center gap-2">
          {notes.length > 0 ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              {t('warningsLabel', { count: String(notes.length) })}
            </span>
          ) : (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              {t('passLabel')}
            </span>
          )}
          <span className="text-xs text-ink/40">{open ? '▲' : '▼'}</span>
        </span>
      </button>

      <CollapsibleSection
        open={open}
        slide={false}
        contentClassName="border-t border-ink/10 px-4 py-3 space-y-3"
      >
        {notes.length === 0 ? (
          <p className="text-xs text-ink/55">{t('passLabel')}</p>
        ) : (
          <ul className="space-y-2">
            {notes.map((note, i) => (
              <li
                key={i}
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs dark:border-amber-900/40 dark:bg-amber-950/20"
              >
                <p className="font-medium text-amber-900 dark:text-amber-200">
                  &ldquo;{note.excerpt}&rdquo;
                </p>
                <p className="mt-0.5 text-amber-800 dark:text-amber-300">
                  {t('suggestionLabel', { suggestion: note.suggestion })}
                </p>
                <p className="mt-0.5 text-amber-700/70 dark:text-amber-400/70">
                  {t('ruleLabel', { rule: note.rule })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>
    </div>
  );
}

export function ManuscriptValidationPanel({
  slug,
  constructorContent,
  analysis,
  onAnalysisChange,
  validating,
  onValidatingChange,
}: {
  slug: string;
  constructorContent: unknown;
  analysis: PreSubmitAnalysis | null | undefined;
  onAnalysisChange: (next: PreSubmitAnalysis) => void;
  validating: boolean;
  onValidatingChange: (running: boolean) => void;
}) {
  const t = useTranslations('ManuscriptValidation');
  const showApiError = useToastApiError();
  const [isStale, setIsStale] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!analysis || !constructorContent) {
        if (!cancelled) setIsStale(false);
        return;
      }
      const hash = await hashConstructorContent(constructorContent);
      if (!cancelled) {
        setIsStale(Boolean(hash && hash !== analysis.contentHash));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [analysis, constructorContent]);

  const runValidation = useCallback(async () => {
    onValidatingChange(true);
    try {
      const data = await apiJson<PreSubmitAnalysis>(
        `/submissions/${encodeURIComponent(slug)}/pre-submit-analysis`,
        { method: 'POST' },
      );
      onAnalysisChange(data);
      toast.success(t('runSuccess'), { id: 'pre-submit-validation-success' });
    } catch (err) {
      showApiError(err, t('runFailed'), { id: 'pre-submit-validation' });
    } finally {
      onValidatingChange(false);
    }
  }, [slug, onAnalysisChange, onValidatingChange, showApiError, t]);

  const hasBlocking =
    Boolean(analysis) &&
    !isStale &&
    (analysis!.formatIssues.length > 0 || analysis!.referenceIssues.length > 0);
  const allClear =
    Boolean(analysis) &&
    !isStale &&
    !hasBlocking &&
    analysis!.grammarNotes.length === 0;

  return (
    <section
      data-field-error={PRE_SUBMIT_VALIDATION_FIELD}
      className="rounded-xl border border-ink/10 bg-paper/50 p-6 shadow-sm dark:border-white/10"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-sans text-base font-semibold text-ink">
            {t('sectionTitle')}
          </h3>
          <p className="mt-0.5 text-xs text-ink/55">{t('sectionHint')}</p>
        </div>
        <button
          type="button"
          disabled={validating}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={() => void runValidation()}
        >
          {validating
            ? t('running')
            : analysis
              ? t('rerunButton')
              : t('runButton')}
        </button>
      </div>

      {isStale && analysis ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
          {t('staleNotice')}
        </p>
      ) : null}

      {allClear ? (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200">
          {t('allClear')}
        </p>
      ) : null}

      {analysis ? (
        <div className="mt-5 space-y-3">
          <BlockingSection
            title={t('structureTitle')}
            issues={isStale ? [] : analysis.formatIssues}
          />
          <BlockingSection
            title={t('referencesTitle')}
            issues={isStale ? [] : analysis.referenceIssues}
            isUnavailable={
              !isStale &&
              analysis.aiUnavailable &&
              analysis.referenceIssues.length === 0
            }
            unavailableNote={t('aiUnavailableNote')}
          />
          <GrammarSection notes={isStale ? [] : analysis.grammarNotes} />
        </div>
      ) : (
        <p className="mt-4 text-xs text-ink/55">{t('notRunHint')}</p>
      )}
    </section>
  );
}
