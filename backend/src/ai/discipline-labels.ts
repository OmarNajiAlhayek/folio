/** Labels from AraBERT fine-tuned config (id2label). Keep in sync with ai-service weights. */
export const ARABIC_DISCIPLINE_LABELS = [
  'الآداب والعلوم الإنسانية',
  'الدراسات التاريخية',
  'العلوم الأساسية',
  'العلوم الاقتصادية والسياسية',
  'العلوم التربوية والنفسية',
  'العلوم الزراعية',
  'العلوم الطبية',
  'العلوم القانونية',
  'العلوم الهندسية',
  'غير محدد',
] as const;

export type ArabicDisciplineLabel = (typeof ARABIC_DISCIPLINE_LABELS)[number];

export const DISCIPLINE_UNSPECIFIED_LABEL = 'غير محدد';

export function isValidDisciplineLabel(value: string): value is ArabicDisciplineLabel {
  return (ARABIC_DISCIPLINE_LABELS as readonly string[]).includes(value);
}

export function parseJournalAllowedDisciplines(raw: string | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }
  return raw
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && isValidDisciplineLabel(s));
}

export function isDisciplineInJournalScope(
  label: string,
  allowed: string[],
): boolean {
  if (!isValidDisciplineLabel(label)) {
    return false;
  }
  if (label === DISCIPLINE_UNSPECIFIED_LABEL) {
    return false;
  }
  if (allowed.length === 0) {
    return true;
  }
  return allowed.includes(label);
}
