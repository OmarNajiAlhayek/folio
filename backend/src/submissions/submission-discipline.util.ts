import { Submission } from '../entities/submission.entity';
import {
  isDisciplineInJournalScope,
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
  discipline: string | null;
  disciplineSource: string | null;
  disciplineSuggested: string | null;
  disciplineSuggestedConfidence: number | null;
  disciplineClassification: DisciplineClassificationJson | null;
  disciplineScopeInJournal: boolean | null;
  disciplineScopeWarning: string | null;
} {
  const suggested = submission.disciplineSuggested;
  const confidence = submission.disciplineSuggestedConfidence;
  const classification = submission.disciplineClassification;
  const scopeInJournal =
    suggested != null
      ? isDisciplineInJournalScope(suggested, allowedDisciplines)
      : null;
  const scopeWarning =
    suggested != null && scopeInJournal === false
      ? 'suggested_out_of_journal_scope'
      : null;

  return {
    discipline: submission.discipline,
    disciplineSource: submission.disciplineSource,
    disciplineSuggested: suggested,
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
  const scopeInJournal = isDisciplineInJournalScope(
    result.top_label,
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
