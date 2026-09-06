import { DataSource, Like } from 'typeorm';
import { Journal } from '../entities/journal.entity';
import { JournalIssue } from '../entities/journal-issue.entity';
import { JournalIssueStatus } from '../entities/journal-issue-status.enum';
import { JournalMembership } from '../entities/journal-membership.entity';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import {
  JOURNAL_CATALOG,
  JOURNAL_FALLBACK_SLUG,
  assertJournalCatalogMatchesDisciplines,
  journalEntryForDisciplineLabel,
} from './journal-catalog';

/**
 * Demo issues for every catalog journal. Two calendar years and more than
 * one عدد per journal, mixing `published` (portal) and `open` (accepting).
 * Seed looks these up by (journal, year, number) and never duplicates them.
 */
export const SEED_ISSUE_SPECS = [
  {
    year: 2025,
    number: 2,
    volume: 41,
    status: JournalIssueStatus.PUBLISHED,
    publishedAt: new Date('2025-12-15T00:00:00.000Z'),
  },
  {
    year: 2026,
    number: 1,
    volume: 42,
    status: JournalIssueStatus.PUBLISHED,
    publishedAt: new Date('2026-03-01T00:00:00.000Z'),
  },
  {
    year: 2026,
    number: 2,
    volume: 42,
    status: JournalIssueStatus.OPEN,
    publishedAt: null,
  },
] as const;

export type SeededPress = {
  journalsBySlug: Map<string, Journal>;
  publishedIssueByJournalId: Map<string, JournalIssue>;
};

export function journalSlugForSampleLabel(
  label: string | null | undefined,
): string {
  return journalEntryForDisciplineLabel(label)?.slug ?? JOURNAL_FALLBACK_SLUG;
}

export async function loadCatalogJournals(
  dataSource: DataSource,
): Promise<Map<string, Journal>> {
  assertJournalCatalogMatchesDisciplines();
  const rows = await dataSource.getRepository(Journal).find();
  const bySlug = new Map(rows.map((j) => [j.slug, j]));
  const missing = JOURNAL_CATALOG.filter((j) => !bySlug.has(j.slug)).map(
    (j) => j.slug,
  );
  if (missing.length > 0) {
    throw new Error(
      `Journal catalog rows missing — run migrations: ${missing.join(', ')}`,
    );
  }
  return bySlug;
}

export async function ensureSeedIssues(
  dataSource: DataSource,
  journals: Iterable<Journal>,
): Promise<Map<string, JournalIssue>> {
  const repo = dataSource.getRepository(JournalIssue);
  const publishedByJournal = new Map<string, JournalIssue>();
  for (const journal of journals) {
    for (const spec of SEED_ISSUE_SPECS) {
      let issue = await repo.findOne({
        where: {
          journalId: journal.id,
          year: spec.year,
          number: spec.number,
        },
      });
      if (!issue) {
        issue = await repo.save(
          repo.create({
            journalId: journal.id,
            year: spec.year,
            number: spec.number,
            volume: spec.volume,
            status: spec.status,
            publishedAt: spec.publishedAt,
          }),
        );
      }
      if (spec.status === JournalIssueStatus.PUBLISHED) {
        publishedByJournal.set(journal.id, issue);
      }
    }
  }
  return publishedByJournal;
}

export async function ensureStaffMemberships(
  dataSource: DataSource,
  journals: Iterable<Journal>,
  staff: ReadonlyArray<{ userId: string; roleSlug: string }>,
): Promise<number> {
  const repo = dataSource.getRepository(JournalMembership);
  let created = 0;
  for (const journal of journals) {
    for (const member of staff) {
      const existing = await repo.findOne({
        where: {
          journalId: journal.id,
          userId: member.userId,
          roleSlug: member.roleSlug,
        },
      });
      if (existing) continue;
      await repo.save(
        repo.create({
          journalId: journal.id,
          userId: member.userId,
          roleSlug: member.roleSlug,
        }),
      );
      created += 1;
    }
  }
  return created;
}

/**
 * Point [Demo]/[SAMPLE] rows at the catalog journal for their discipline
 * and, when already published, at that journal's latest seeded published issue.
 * In-flight manuscripts keep `issue_id` null until slice 4.
 */
export async function placeDemoSubmissions(
  dataSource: DataSource,
  journalsBySlug: Map<string, Journal>,
  publishedIssueByJournalId: Map<string, JournalIssue>,
  titlePrefixes: readonly string[] = ['[Demo]', '[DEMO]', '[SAMPLE]'],
): Promise<{ placed: number; publishedPlaced: number }> {
  const repo = dataSource.getRepository(Submission);
  const rows = await repo.find({
    where: titlePrefixes.map((prefix) => ({ title: Like(`${prefix}%`) })),
    select: [
      'id',
      'status',
      'journalId',
      'issueId',
      'disciplines',
      'disciplineSuggestedLabels',
    ],
  });

  let placed = 0;
  let publishedPlaced = 0;
  for (const row of rows) {
    const label = row.disciplines?.[0] ?? row.disciplineSuggestedLabels?.[0];
    const journal = journalsBySlug.get(journalSlugForSampleLabel(label));
    if (!journal) continue;
    const isPublished = row.status === SubmissionStatus.PUBLISHED;
    const nextIssueId = isPublished
      ? (publishedIssueByJournalId.get(journal.id)?.id ?? null)
      : null;
    if (row.journalId === journal.id && row.issueId === nextIssueId) {
      continue;
    }
    await repo.update(row.id, {
      journalId: journal.id,
      issueId: nextIssueId,
    });
    placed += 1;
    if (isPublished) publishedPlaced += 1;
  }
  return { placed, publishedPlaced };
}

export async function seedPressFixtures(
  dataSource: DataSource,
  staff: ReadonlyArray<{ userId: string; roleSlug: string }>,
): Promise<SeededPress & { membershipsCreated: number }> {
  const journalsBySlug = await loadCatalogJournals(dataSource);
  const journals = [...journalsBySlug.values()];
  const publishedIssueByJournalId = await ensureSeedIssues(
    dataSource,
    journals,
  );
  const membershipsCreated = await ensureStaffMemberships(
    dataSource,
    journals,
    staff,
  );
  return { journalsBySlug, publishedIssueByJournalId, membershipsCreated };
}
