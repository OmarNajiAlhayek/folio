'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';
import {
  ARABIC_DISCIPLINE_LABELS,
  DISCIPLINE_UNSPECIFIED_LABEL,
  disciplineI18nKey,
} from '@/lib/discipline-labels';

/** Canonical Arabic labels used in filters/API (excludes unspecified). */
export const SELECTABLE_DISCIPLINE_LABELS = ARABIC_DISCIPLINE_LABELS.filter(
  (l) => l !== DISCIPLINE_UNSPECIFIED_LABEL,
);

export function useDisciplineLabel() {
  const t = useTranslations('SubmissionWorkflow');

  const format = useCallback(
    (canonical: string | null | undefined): string => {
      if (!canonical?.trim()) return '';
      const key = disciplineI18nKey(canonical);
      if (key) return t(key);
      return canonical;
    },
    [t],
  );

  const selectableOptions = useMemo(
    () =>
      SELECTABLE_DISCIPLINE_LABELS.map((canonical) => ({
        value: canonical,
        label: format(canonical),
      })),
    [format],
  );

  const formatList = useCallback(
    (labels: string[] | null | undefined): string => {
      const visible = (labels ?? []).filter((label) => label.trim().length > 0);
      if (visible.length === 0) return '';
      return visible.map((label) => format(label)).join(', ');
    },
    [format],
  );

  return { format, formatList, selectableOptions };
}
