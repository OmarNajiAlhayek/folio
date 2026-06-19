'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { apiJson } from '@/lib/api';
import { ApiError } from '@/lib/api-response';
import type {
  DisciplineSuggestion,
  SubmissionDisciplineFields,
} from '@/lib/discipline-labels';
import { MAX_DISCIPLINES } from '@/lib/discipline-labels';
import { useDisciplineLabel } from '@/lib/use-discipline-label';
import { useApiErrorMessages } from '@/lib/use-api-error-messages';
import { toast } from '@/lib/toast';
import { Spinner } from '@/components/ui/spinner';
import { MultiSelect } from '@/components/ui/multi-select';
import { DisciplineBadges } from '@/components/discipline-badges';

type Props = {
  slug: string;
  mode: 'author' | 'editor';
  fields: SubmissionDisciplineFields;
  canEdit: boolean;
  onUpdated: () => void;
};

export function SubmissionDisciplinePanel({
  slug,
  mode,
  fields,
  canEdit,
  onUpdated,
}: Props) {
  const t = useTranslations('SubmissionWorkflow');
  const { format: formatDiscipline, selectableOptions } = useDisciplineLabel();
  const { resolve: resolveApiError } = useApiErrorMessages();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pick, setPick] = useState<string[]>(fields.disciplines ?? []);

  const enc = encodeURIComponent(slug);
  const showScopeWarning =
    fields.disciplineScopeWarning === 'suggested_out_of_journal_scope' ||
    fields.disciplineScopeInJournal === false;

  const suggestedLabels = fields.disciplineSuggestedLabels ?? [];
  const confirmedLabels = fields.disciplines ?? [];
  const suggestionsMatchConfirmed = useMemo(() => {
    if (suggestedLabels.length === 0 || confirmedLabels.length === 0) {
      return false;
    }
    if (suggestedLabels.length !== confirmedLabels.length) {
      return false;
    }
    return suggestedLabels.every((label) => confirmedLabels.includes(label));
  }, [confirmedLabels, suggestedLabels]);

  const suggest = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      await apiJson<DisciplineSuggestion>(
        `/submissions/${enc}/suggest-discipline`,
        { method: 'POST' },
      );
      toast.success(t('disciplineSuggestSuccess'), {
        id: 'submission-discipline-suggest',
      });
      onUpdated();
    } catch (e) {
      const fallback =
        e instanceof ApiError && e.code === 'AI_SERVICE_UNAVAILABLE'
          ? t('disciplineSuggestNotConfigured')
          : t('disciplineSuggestFailed');
      setError(resolveApiError(e, fallback));
    } finally {
      setBusy(false);
    }
  }, [enc, onUpdated, resolveApiError, t]);

  const applyDisciplines = useCallback(
    async (disciplines: string[]) => {
      if (disciplines.length === 0) {
        return;
      }
      setBusy(true);
      setError('');
      try {
        await apiJson(`/submissions/${enc}/discipline`, {
          method: 'PATCH',
          body: JSON.stringify({ disciplines }),
        });
        setPick(disciplines);
        toast.success(t('disciplineSaved'), {
          id: 'submission-discipline-save',
        });
        onUpdated();
      } catch (e) {
        setError(resolveApiError(e, t('disciplineSaveFailed')));
      } finally {
        setBusy(false);
      }
    },
    [enc, onUpdated, resolveApiError, t],
  );

  const acceptSuggestion = () => {
    if (suggestedLabels.length > 0) {
      setPick(suggestedLabels);
      void applyDisciplines(suggestedLabels);
    }
  };

  const handlePickChange = (next: string[]) => {
    if (next.length > MAX_DISCIPLINES) {
      return;
    }
    setPick(next);
  };

  return (
    <div className="rounded-lg border border-ink/10 bg-paper/30 px-4 py-4">
      <h4 className="text-sm font-semibold text-ink">
        {t('disciplineSection')}
      </h4>
      <p className="mt-1 text-xs leading-relaxed text-ink/60">
        {mode === 'author'
          ? t('disciplineAuthorHint')
          : t('disciplineEditorHint')}
      </p>

      {suggestedLabels.length > 0 && (
        <div
          className="mt-3 rounded-md border border-ink/10 bg-surface px-3 py-2 text-sm"
          dir="auto"
        >
          <p className="font-medium text-ink">{t('disciplineAiSuggestion')}</p>
          <div className="mt-2">
            <DisciplineBadges labels={suggestedLabels} size="sm" />
          </div>
          {fields.disciplineSuggestedConfidence != null &&
            suggestedLabels[0] && (
              <p className="mt-2 text-ink/55">
                {formatDiscipline(suggestedLabels[0])}{' '}
                <span className="text-ink/55">
                  ({fields.disciplineSuggestedConfidence.toFixed(1)}%)
                </span>
              </p>
            )}
          {showScopeWarning && (
            <p className="mt-2 text-xs font-medium text-amber-900">
              {t('disciplineScopeWarning')}
            </p>
          )}
        </div>
      )}

      {confirmedLabels.length > 0 && (
        <div className="mt-3 text-sm text-ink/80" dir="auto">
          <p className="font-medium text-ink">{t('disciplineConfirmed')}</p>
          <div className="mt-2">
            <DisciplineBadges labels={confirmedLabels} size="sm" />
          </div>
          {fields.disciplineSource && (
            <p className="mt-2 text-xs text-ink/50">
              ({t(`disciplineSource_${fields.disciplineSource}`)})
            </p>
          )}
        </div>
      )}

      {mode === 'editor' &&
        suggestedLabels.length === 0 &&
        confirmedLabels.length === 0 && (
          <p className="mt-3 text-sm text-ink/60">
            {t('disciplineEditorEmpty')}
          </p>
        )}

      {canEdit && (
        <div className="mt-4 flex flex-col gap-3">
          {mode === 'author' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void suggest()}
              className="w-fit rounded-md border border-ink/15 bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-paper disabled:opacity-60"
            >
              {busy ? (
                <Spinner size="sm" className="border-ink/30 border-t-ink" />
              ) : (
                t('disciplineSuggestAction')
              )}
            </button>
          )}

          {mode === 'author' &&
            suggestedLabels.length > 0 &&
            !suggestionsMatchConfirmed && (
              <button
                type="button"
                disabled={busy}
                onClick={() => acceptSuggestion()}
                className="w-fit rounded-md bg-accent/15 px-3 py-2 text-sm font-medium text-accent hover:bg-accent/25 disabled:opacity-60"
              >
                {t('disciplineAcceptAllSuggestions')}
              </button>
            )}

          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">
              {t('disciplineSelectLabel')}
            </span>
            <p className="text-xs text-ink/55">{t('disciplineSelectHint')}</p>
            <MultiSelect
              options={selectableOptions}
              value={pick}
              onChange={handlePickChange}
              emptyLabel={t('disciplineSelectPlaceholder')}
              manySelectedLabel={(count) =>
                t('disciplineManySelected', { count })
              }
              disabled={busy}
              className="w-full text-start"
            />
          </div>
          <button
            type="button"
            disabled={busy || pick.length === 0}
            onClick={() => void applyDisciplines(pick)}
            className="w-fit rounded-md bg-ink px-3 py-2 text-sm font-medium text-paper disabled:opacity-60"
          >
            {t('disciplineConfirmAction')}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
