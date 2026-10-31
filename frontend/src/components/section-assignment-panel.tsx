'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { apiJson } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { SubmissionRecord } from '@/lib/queries/submissions';
import { toast } from '@/lib/toast';
import { useToastApiError } from '@/lib/use-toast-api-error';

type Props = {
  submission: SubmissionRecord;
  meId: string;
  canRecordDecision: boolean;
};

/** Who holds this paper, and the recommendation box for a section editor who cannot record the decision. */
export function SectionAssignmentPanel({
  submission,
  meId,
  canRecordDecision,
}: Props) {
  const t = useTranslations('SubmissionDetail');
  const locale = useLocale();
  const isAr = locale === 'ar';
  const showApiError = useToastApiError();
  const queryClient = useQueryClient();
  const mine = submission.sectionEditorAssignments?.find(
    (row) => row.sectionEditorId === meId,
  );
  const [text, setText] = useState(mine?.recommendation ?? '');
  const [saving, setSaving] = useState(false);
  const assignees = submission.sectionEditorAssignments ?? [];

  async function save() {
    if (!submission.slug) return;
    setSaving(true);
    try {
      await apiJson(
        `/submissions/${encodeURIComponent(submission.slug)}/section-recommendation`,
        {
          method: 'PATCH',
          body: JSON.stringify({ recommendation: text }),
        },
      );
      toast.success(t('recommendationSaved'));
      await queryClient.invalidateQueries({
        queryKey: queryKeys.submissionDetail(submission.slug),
      });
    } catch (err) {
      showApiError(err, t('recommendationFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-ink/10 bg-paper/40 p-4 dark:border-white/10">
      {submission.section ? (
        <p className="text-xs text-ink/70">
          <span className="font-semibold text-ink">{t('sectionLabel')}: </span>
          {isAr ? submission.section.nameAr : submission.section.nameEn}
        </p>
      ) : null}
      <p className="text-xs font-semibold text-ink">{t('assignedTo')}</p>
      {assignees.length === 0 ? (
        <p className="text-xs text-ink/55">{t('unassigned')}</p>
      ) : (
        <ul className="space-y-1 text-xs text-ink/80">
          {assignees.map((row) => (
            <li key={row.id}>
              {row.sectionEditor?.displayName ?? row.sectionEditorId}
              {row.canRecordDecision ? '' : ` — ${t('recommendsOnly')}`}
            </li>
          ))}
        </ul>
      )}
      {mine && !canRecordDecision ? (
        <div className="space-y-2">
          <label
            className="text-xs font-semibold text-ink"
            htmlFor="section-recommendation"
          >
            {t('recommendationLabel')}
          </label>
          <textarea
            id="section-recommendation"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={4}
            maxLength={8000}
            className="w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 text-xs text-ink dark:border-white/15"
          />
          <Button
            size="sm"
            disabled={saving || text.trim().length === 0}
            onClick={() => void save()}
          >
            {t('recommendationSave')}
          </Button>
        </div>
      ) : null}
      {mine?.recommendation && canRecordDecision ? (
        <p className="whitespace-pre-wrap text-xs text-ink/70">
          <span className="font-semibold text-ink">
            {t('recommendationLabel')}:{' '}
          </span>
          {mine.recommendation}
        </p>
      ) : null}
      {!mine && canRecordDecision
        ? assignees
            .filter((row) => row.recommendation)
            .map((row) => (
              <p
                key={row.id}
                className="whitespace-pre-wrap text-xs text-ink/70"
              >
                <span className="font-semibold text-ink">
                  {row.sectionEditor?.displayName}:{' '}
                </span>
                {row.recommendation}
              </p>
            ))
        : null}
    </div>
  );
}
