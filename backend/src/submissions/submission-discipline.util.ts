import { Submission } from '../entities/submission.entity';
import {
  anyDisciplineInJournalScope,
  anyDisciplineOutOfJournalScope,
  labelsFromProbabilities,
  parseJournalAllowedDisciplines,
} from '../ai/discipline-labels';
import type {
  ClassifyArticleResponse,
  DisciplineClassificationJson,
} from '../ai/ai-client.types';

export function classificationMetadataForSubmission(
  submission: Submission,
  allowedDisciplines: string[],
): {
  disciplines: string[];
  disciplineSource: string | null;
  disciplineSuggestedLabels: string[];
  disciplineSuggestedConfidence: number | null;
  disciplineClassification: DisciplineClassificationJson | null;
  disciplineScopeInJournal: boolean | null;
  disciplineScopeWarning: string | null;
} {
  const suggested = submission.disciplineSuggestedLabels ?? [];
  const confidence = submission.disciplineSuggestedConfidence;
  const classification = submission.disciplineClassification;
  const scopeInJournal =
    suggested.length > 0
      ? anyDisciplineInJournalScope(suggested, allowedDisciplines)
      : null;
  const scopeWarning =
    suggested.length > 0 &&
    anyDisciplineOutOfJournalScope(suggested, allowedDisciplines)
      ? 'suggested_out_of_journal_scope'
      : null;

  return {
    disciplines: submission.disciplines ?? [],
    disciplineSource: submission.disciplineSource,
    disciplineSuggestedLabels: suggested,
    disciplineSuggestedConfidence:
      confidence != null ? Number(confidence) : null,
    disciplineClassification: classification,
    disciplineScopeInJournal: scopeInJournal,
    disciplineScopeWarning: scopeWarning,
  };
}

export function buildClassificationJson(
  result: ClassifyArticleResponse,
  allowedDisciplines: string[],
): DisciplineClassificationJson {
  const suggestedLabels = labelsFromProbabilities(
    result.top_label,
    result.probabilities,
  );
  const scopeInJournal = anyDisciplineInJournalScope(
    suggestedLabels,
    allowedDisciplines,
  );
  return {
    probabilities: result.probabilities,
    classifiedAt: new Date().toISOString(),
    scopeInJournal,
    scopeWarning: scopeInJournal ? null : 'suggested_out_of_journal_scope',
  };
}

export function resolveClassifyText(submission: Submission): {
  title: string;
  keywords: string;
  abstract: string;
} {
  return {
    title: (submission.titleAr ?? submission.title ?? '').trim(),
    keywords: (submission.keywordsAr ?? submission.keywords ?? '').trim(),
    abstract: (submission.abstractAr ?? submission.abstract ?? '').trim(),
  };
}

export function parseAllowedDisciplinesFromEnv(
  raw: string | undefined,
): string[] {
  return parseJournalAllowedDisciplines(raw);
}
