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

export const MAX_DISCIPLINES = 3;

/** Minimum classifier probability (0–100 scale) for secondary suggested labels. */
export const DISCIPLINE_SUGGEST_THRESHOLD = 12;

export const SELECTABLE_DISCIPLINE_LABELS = ARABIC_DISCIPLINE_LABELS.filter(
  (l) => l !== DISCIPLINE_UNSPECIFIED_LABEL,
);

/** Stable i18n / API keys; keep in sync with frontend messages SubmissionWorkflow.discipline_* */
export const DISCIPLINE_I18N_KEYS = {
  'الآداب والعلوم الإنسانية': 'discipline_humanities',
  'الدراسات التاريخية': 'discipline_historical_studies',
  'العلوم الأساسية': 'discipline_basic_sciences',
  'العلوم الاقتصادية والسياسية': 'discipline_economic_political',
  'العلوم التربوية والنفسية': 'discipline_education_psychology',
  'العلوم الزراعية': 'discipline_agricultural',
  'العلوم الطبية': 'discipline_medical',
  'العلوم القانونية': 'discipline_legal',
  'العلوم الهندسية': 'discipline_engineering',
  'غير محدد': 'discipline_unspecified',
} as const satisfies Record<ArabicDisciplineLabel, string>;

export type DisciplineI18nKey =
  (typeof DISCIPLINE_I18N_KEYS)[ArabicDisciplineLabel];

export function disciplineI18nKey(label: string): DisciplineI18nKey | null {
  if (!isValidDisciplineLabel(label)) {
    return null;
  }
  return DISCIPLINE_I18N_KEYS[label];
}

export function isValidDisciplineLabel(
  value: string,
): value is ArabicDisciplineLabel {
  return (ARABIC_DISCIPLINE_LABELS as readonly string[]).includes(value);
}

export function isSelectableDisciplineLabel(value: string): boolean {
  return (
    isValidDisciplineLabel(value) && value !== DISCIPLINE_UNSPECIFIED_LABEL
  );
}

export function parseJournalAllowedDisciplines(
  raw: string | undefined,
): string[] {
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

export function anyDisciplineInJournalScope(
  labels: string[],
  allowed: string[],
): boolean {
  return labels.some((label) => isDisciplineInJournalScope(label, allowed));
}

export function anyDisciplineOutOfJournalScope(
  labels: string[],
  allowed: string[],
): boolean {
  if (allowed.length === 0) {
    return false;
  }
  return labels.some(
    (label) =>
      isValidDisciplineLabel(label) &&
      label !== DISCIPLINE_UNSPECIFIED_LABEL &&
      !allowed.includes(label),
  );
}

/** Top label first, then others at or above threshold, deduped, capped. */
export function labelsFromProbabilities(
  topLabel: string,
  probabilities: Record<string, number>,
): string[] {
  const labels: string[] = [];
  const add = (label: string) => {
    if (!isSelectableDisciplineLabel(label) || labels.includes(label)) {
      return;
    }
    labels.push(label);
  };

  add(topLabel);

  const others = Object.entries(probabilities)
    .filter(
      ([label, prob]) =>
        label !== topLabel && prob >= DISCIPLINE_SUGGEST_THRESHOLD,
    )
    .sort((a, b) => b[1] - a[1]);

  for (const [label] of others) {
    if (labels.length >= MAX_DISCIPLINES) {
      break;
    }
    add(label);
  }

  return labels.slice(0, MAX_DISCIPLINES);
}

export function validateDisciplines(labels: string[]): void {
  if (labels.length < 1 || labels.length > MAX_DISCIPLINES) {
    throw new Error(
      `Disciplines must contain between 1 and ${MAX_DISCIPLINES} labels`,
    );
  }
  const seen = new Set<string>();
  for (const label of labels) {
    if (!isSelectableDisciplineLabel(label)) {
      throw new Error(`Invalid discipline label: ${label}`);
    }
    if (seen.has(label)) {
      throw new Error('Duplicate discipline labels are not allowed');
    }
    seen.add(label);
  }
}
