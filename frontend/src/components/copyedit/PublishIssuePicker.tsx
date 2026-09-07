'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { apiJson } from '@/lib/api';
import { SearchableSelect } from '@/components/ui/searchable-select';

export type PublishableIssue = {
  id: string;
  year: number;
  number: number;
  volume: number | null;
  status: 'planned' | 'open' | 'published' | 'closed';
  titleAr: string | null;
  titleEn: string | null;
  citationAr: string;
  citationEn: string;
  labelAr: string;
};

/**
 * Issue (العدد) an article is about to be filed under.
 *
 * Publishing requires one, so this owns both the fetch and the selection and
 * hands the chosen id back up. The citation strings are rendered server-side
 * (`journals/journal-citation.ts`) so staff see exactly the label that will
 * appear on the article.
 */
export function PublishIssuePicker({
  submissionSlug,
  value,
  onValueChange,
  disabled,
}: {
  submissionSlug: string;
  value: string;
  onValueChange: (issueId: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('Copyedit');
  const locale = useLocale();
  const isAr = locale.startsWith('ar');
  const [issues, setIssues] = useState<PublishableIssue[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await apiJson<PublishableIssue[]>(
        `/submissions/${encodeURIComponent(submissionSlug)}/publishable-issues`,
      );
      setIssues(rows);
      // Preselect when there is no real choice to make.
      if (rows.length === 1) onValueChange(rows[0].id);
    } catch {
      setIssues([]);
    } finally {
      setLoading(false);
    }
  }, [submissionSlug, onValueChange]);

  useEffect(() => {
    void load();
  }, [load]);

  function issueLabel(i: PublishableIssue): string {
    const citation = isAr ? i.labelAr : i.citationEn;
    const title = isAr ? i.titleAr : i.titleEn;
    return title ? `${citation} — ${title}` : citation;
  }

  if (loading) {
    return <p className="mt-3 text-sm text-ink/60">{t('issuesLoading')}</p>;
  }

  if (issues.length === 0) {
    return (
      <p className="mt-3 text-sm text-danger" role="status">
        {t('issuesEmpty')}
      </p>
    );
  }

  return (
    <div className="mt-3">
      <label
        className="mb-1 block text-sm font-medium text-ink/80"
        htmlFor={`publish-issue-${submissionSlug}`}
      >
        {t('issueLabel')}
      </label>
      <SearchableSelect
        options={issues.map((i) => ({
          value: i.id,
          label: issueLabel(i),
          keywords: [String(i.year), String(i.number)],
        }))}
        value={value}
        onValueChange={onValueChange}
        placeholder={t('issuePlaceholder')}
        searchPlaceholder={t('issuePlaceholder')}
        emptyText={t('issuesEmpty')}
        disabled={disabled}
      />
    </div>
  );
}
