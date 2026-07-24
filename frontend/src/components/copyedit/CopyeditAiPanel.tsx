'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiJson } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useToastApiError } from '@/lib/use-toast-api-error';
import { CollapsibleSection } from '@/components/ui/collapsible-section';

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
  referenceIssues: string[];
  aiUnavailable: boolean;
};

function CheckSection({
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
  const t = useTranslations('CopyeditAi');
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
              N/A
            </span>
          ) : hasIssues ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              {t('issuesLabel', { count: String(issues.length) })}
            </span>
          ) : (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
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
                className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900"
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
  const t = useTranslations('CopyeditAi');
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
          {t('grammarTitle')}
        </span>
        <span className="flex items-center gap-2">
          {notes.length > 0 ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              {t('issuesLabel', { count: String(notes.length) })}
            </span>
          ) : (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
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
        {notes.length === 0 ? (
          <p className="text-xs text-ink/55">{t('passLabel')}</p>
        ) : (
          <ul className="space-y-2">
            {notes.map((note, i) => (
              <li
                key={i}
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs"
              >
                <p className="font-medium text-amber-900">
                  &ldquo;{note.excerpt}&rdquo;
                </p>
                <p className="mt-0.5 text-amber-800">
                  Suggestion: {note.suggestion}
                </p>
                <p className="mt-0.5 text-amber-700/70">Rule: {note.rule}</p>
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>
    </div>
  );
}

export function CopyeditAiPanel({
  assignmentSlug,
}: {
  assignmentSlug: string;
}) {
  const t = useTranslations('CopyeditAi');
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

  return (
    <section className="mt-8 rounded-xl border border-ink/10 bg-paper/50 p-6 shadow-sm">
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
          {running ? t('running') : t('runButton')}
        </button>
      </div>

      {result && (
        <div className="mt-5 space-y-3">
          <CheckSection title={t('formatTitle')} issues={result.formatIssues} />
          <GrammarSection notes={result.grammarNotes} />
          <CheckSection
            title={t('referencesTitle')}
            issues={result.referenceIssues}
            isUnavailable={
              result.aiUnavailable && result.referenceIssues.length === 0
            }
            unavailableNote={t('aiUnavailableNote')}
          />
        </div>
      )}
    </section>
  );
}
