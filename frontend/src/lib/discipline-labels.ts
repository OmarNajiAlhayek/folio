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
