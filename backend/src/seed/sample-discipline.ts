import { DataSource } from 'typeorm';
import {
  labelsFromProbabilities,
  parseJournalAllowedDisciplines,
} from '../ai/discipline-labels';
import type { DisciplineClassificationJson } from '../ai/ai-client.types';
import { SubmissionDisciplineSource } from '../entities/submission-discipline-source.enum';
import { Submission } from '../entities/submission.entity';
import {
  SAMPLE_DISCIPLINE_DEFAULT,
  SAMPLE_DISCIPLINE_MEDICAL,
} from './sample-content';

function sampleDisciplineClassification(
  topLabel: string,
  confidence: number,
  scopeInJournal: boolean,
): DisciplineClassificationJson {
  return {
    probabilities: {
      [topLabel]: confidence,
      'غير محدد': Math.max(0, 100 - confidence - 2),
    },
    classifiedAt: new Date().toISOString(),
    scopeInJournal,
    scopeWarning: scopeInJournal ? null : 'suggested_out_of_journal_scope',
  };
}

/**
 * Dev-only: ensure discipline suggestion exists for UI demos.
 * When submit() already stored AI output, still applies `confirmAsAuthor` so
 * `disciplines` are set for catalog filters and public API responses.
 */
export async function syncSampleDiscipline(
  dataSource: DataSource,
  submissionId: string,
  options: {
    topLabel?: string;
    suggestedLabels?: string[];
    disciplines?: string[];
    confidence?: number;
    confirmAsAuthor?: boolean;
    force?: boolean;
  } = {},
): Promise<void> {
  const subRepo = dataSource.getRepository(Submission);
  const row = await subRepo.findOne({ where: { id: submissionId } });
  if (!row) {
    return;
  }

  const topLabel = options.topLabel ?? SAMPLE_DISCIPLINE_DEFAULT;
  const confidence = options.confidence ?? 88.5;
  const suggestedLabels =
    options.suggestedLabels ??
    labelsFromProbabilities(topLabel, {
      [topLabel]: confidence,
      'غير محدد': Math.max(0, 100 - confidence - 2),
    });

  if ((row.disciplines?.length ?? 0) > 0 && !options.force) {
    return;
  }

  if ((row.disciplineSuggestedLabels?.length ?? 0) > 0 && !options.force) {
    if (options.confirmAsAuthor) {
      row.disciplines = options.disciplines ?? suggestedLabels;
      row.disciplineSource = SubmissionDisciplineSource.AUTHOR;
      await subRepo.save(row);
    }
    return;
  }
  const allowed = parseJournalAllowedDisciplines(
    process.env.JOURNAL_ALLOWED_DISCIPLINES,
  );
  const scopeInJournal =
    allowed.length === 0
      ? true
      : suggestedLabels.some((label) => allowed.includes(label));

  row.disciplineSuggestedLabels = suggestedLabels;
  row.disciplineSuggestedConfidence = confidence.toFixed(2);
  row.disciplineClassification = sampleDisciplineClassification(
    topLabel,
    confidence,
    scopeInJournal,
  );
  if (options.confirmAsAuthor) {
    row.disciplines = options.disciplines ?? suggestedLabels;
    row.disciplineSource = SubmissionDisciplineSource.AUTHOR;
  }
  await subRepo.save(row);
}

export function queueSampleDisciplineLabel(): string {
  const allowed = parseJournalAllowedDisciplines(
    process.env.JOURNAL_ALLOWED_DISCIPLINES,
  );
  if (allowed.length > 0 && !allowed.includes(SAMPLE_DISCIPLINE_MEDICAL)) {
    return SAMPLE_DISCIPLINE_MEDICAL;
  }
  return SAMPLE_DISCIPLINE_DEFAULT;
}
