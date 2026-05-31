/** Arabic discipline taxonomy (sync with backend ai/discipline-labels.ts). */
export const ARABIC_DISCIPLINE_LABELS = [
  "الآداب والعلوم الإنسانية",
  "الدراسات التاريخية",
  "العلوم الأساسية",
  "العلوم الاقتصادية والسياسية",
  "العلوم التربوية والنفسية",
  "العلوم الزراعية",
  "العلوم الطبية",
  "العلوم القانونية",
  "العلوم الهندسية",
  "غير محدد",
] as const;

export type ArabicDisciplineLabel = (typeof ARABIC_DISCIPLINE_LABELS)[number];

export const DISCIPLINE_UNSPECIFIED_LABEL = "غير محدد";

/** Stable i18n keys; keep in sync with backend DISCIPLINE_I18N_KEYS and messages. */
export const DISCIPLINE_I18N_KEYS = {
  "الآداب والعلوم الإنسانية": "discipline_humanities",
  "الدراسات التاريخية": "discipline_historical_studies",
  "العلوم الأساسية": "discipline_basic_sciences",
  "العلوم الاقتصادية والسياسية": "discipline_economic_political",
  "العلوم التربوية والنفسية": "discipline_education_psychology",
  "العلوم الزراعية": "discipline_agricultural",
  "العلوم الطبية": "discipline_medical",
  "العلوم القانونية": "discipline_legal",
  "العلوم الهندسية": "discipline_engineering",
  "غير محدد": "discipline_unspecified",
} as const satisfies Record<ArabicDisciplineLabel, string>;

export type DisciplineI18nKey =
  (typeof DISCIPLINE_I18N_KEYS)[ArabicDisciplineLabel];

export function isValidDisciplineLabel(
  value: string,
): value is ArabicDisciplineLabel {
  return (ARABIC_DISCIPLINE_LABELS as readonly string[]).includes(value);
}

export function disciplineI18nKey(label: string): DisciplineI18nKey | null {
  if (!isValidDisciplineLabel(label)) {
    return null;
  }
  return DISCIPLINE_I18N_KEYS[label];
}

export type DisciplineSuggestion = {
  topLabel: string;
  topConfidence: number;
  probabilities: Record<string, number>;
  scopeInJournal: boolean;
  scopeWarning: string | null;
  discipline: string | null;
  disciplineSuggested: string | null;
};

export type SubmissionDisciplineFields = {
  discipline?: string | null;
  disciplineSource?: string | null;
  disciplineSuggested?: string | null;
  disciplineSuggestedConfidence?: number | null;
  disciplineScopeInJournal?: boolean | null;
  disciplineScopeWarning?: string | null;
};
