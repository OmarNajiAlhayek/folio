'use client';

import { useLocale, useTranslations } from 'next-intl';
import { SimpleSelect } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { useJournalOptions, useJournalSections } from '@/lib/queries/journals';

type Props = {
  journalId: string;
  value: string;
  onChange: (sectionId: string) => void;
  disabled?: boolean;
  invalid?: boolean;
};

/** Active sections of the journal the author already chose. */
export function SubmissionSectionPicker({
  journalId,
  value,
  onChange,
  disabled,
  invalid,
}: Props) {
  const t = useTranslations('SubmissionWorkflow');
  const locale = useLocale();
  const { data: journals } = useJournalOptions();
  const slug = journals?.find((journal) => journal.id === journalId)?.slug;
  const { data, isPending, isError } = useJournalSections(slug);
  const isAr = locale === 'ar';

  const options = (data ?? []).map((section) => ({
    value: section.id,
    label: isAr ? section.nameAr : section.nameEn,
  }));

  return (
    <div className="flex flex-col gap-2 text-sm" data-field-error="sectionId">
      <label className="font-semibold text-ink" id="submission-section-label">
        {t('sectionLabel')} <span className="text-red-500">*</span>
      </label>
      {!journalId ? (
        <p className="text-xs text-ink/50">{t('sectionNeedsJournal')}</p>
      ) : isPending ? (
        <span className="inline-flex items-center gap-2 text-xs text-ink/55">
          <Spinner className="size-4" />
          {t('sectionLoading')}
        </span>
      ) : isError ? (
        <p className="text-xs text-red-700" role="alert">
          {t('sectionLoadFailed')}
        </p>
      ) : (
        <SimpleSelect
          value={value}
          onValueChange={onChange}
          options={options}
          placeholder={t('sectionPlaceholder')}
          disabled={disabled || options.length === 0}
          aria-labelledby="submission-section-label"
          className={
            invalid
              ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-500/15'
              : undefined
          }
        />
      )}
      <p className="text-xs leading-relaxed text-ink/50">{t('sectionHint')}</p>
    </div>
  );
}
