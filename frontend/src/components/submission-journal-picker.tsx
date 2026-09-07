'use client';

import { useLocale, useTranslations } from 'next-intl';
import { SimpleSelect } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { useJournalOptions } from '@/lib/queries/journals';

type Props = {
  value: string;
  onChange: (journalId: string) => void;
  disabled?: boolean;
  invalid?: boolean;
};

/**
 * The journal (المجلة) an author submits to. Required: every manuscript has an
 * editorial home from the moment it is created, which is what scopes the
 * editor queue and gives the article an issue to be published into.
 *
 * Titles follow the reading locale, but the value is always the journal id —
 * slugs are the public URL contract, ids are what the submission stores.
 */
export function SubmissionJournalPicker({
  value,
  onChange,
  disabled,
  invalid,
}: Props) {
  const t = useTranslations('SubmissionWorkflow');
  const locale = useLocale();
  const { data, isPending, isError } = useJournalOptions();

  const options = (data ?? []).map((j) => ({
    value: j.id,
    label: locale === 'ar' ? j.titleAr : j.titleEn,
  }));

  return (
    <div className="flex flex-col gap-2 text-sm" data-field-error="journalId">
      <label className="font-semibold text-ink" id="submission-journal-label">
        {t('journalLabel')} <span className="text-red-500">*</span>
      </label>
      {isPending ? (
        <span className="inline-flex items-center gap-2 text-xs text-ink/55">
          <Spinner className="size-4" />
          {t('journalLoading')}
        </span>
      ) : isError ? (
        <p className="text-xs text-red-700" role="alert">
          {t('journalLoadFailed')}
        </p>
      ) : (
        <SimpleSelect
          value={value}
          onValueChange={onChange}
          options={options}
          placeholder={t('journalPlaceholder')}
          disabled={disabled}
          aria-labelledby="submission-journal-label"
          className={
            invalid
              ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-500/15'
              : undefined
          }
        />
      )}
      <p className="text-xs text-ink/50 leading-relaxed">{t('journalHint')}</p>
    </div>
  );
}
