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

/** Kept stable so existing Playwright logins still reach the econj queue. */
export const SEEDED_PRESS_EDITOR_EMAIL = 'editor@folio.dev';
export const SEEDED_EDITOR_PASSWORD = 'Editor123!';
export const SEEDED_SECTION_EDITOR_PASSWORD = 'Section123!';
export const SEEDED_MANAGER_PASSWORD = 'Manager123!';
export const SEEDED_PRESS_MANAGER_EMAIL = 'manager@folio.local';

export function seededEditorEmail(slug: string): string {
  return slug === 'econj'
    ? SEEDED_PRESS_EDITOR_EMAIL
    : `editor.${slug}@folio.dev`;
}

export function seededSectionEditorEmail(slug: string): string {
  return `section.${slug}@folio.dev`;
}

export function seededManagerEmail(slug: string): string {
  return slug === 'econj'
    ? SEEDED_PRESS_MANAGER_EMAIL
    : `manager.${slug}@folio.dev`;
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

/**
 * One user holds `roleSlug` on exactly one journal. Extra rows for that pair
 * are removed so a re-seed does not leave the old press-wide editor in place.
 */
export async function ensureExclusiveJournalMembership(
  dataSource: DataSource,
  journal: Journal,
  userId: string,
  roleSlug: string,
): Promise<boolean> {
  const repo = dataSource.getRepository(JournalMembership);
  const rows = await repo.find({ where: { userId, roleSlug } });
  const extras = rows.filter((row) => row.journalId !== journal.id);
  if (extras.length > 0) {
    await repo.remove(extras);
  }
  if (rows.some((row) => row.journalId === journal.id)) {
    return false;
  }
  await repo.save(
    repo.create({
      journalId: journal.id,
      userId,
      roleSlug,
    }),
  );
  return true;
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
/**
 * Files one sample onto its journal and returns the issue to publish it into.
 *
 * Publishing requires an issue (slice 4), so a sample must be placed *before*
 * `publishSubmission` rather than by the bulk `placeDemoSubmissions` sweep that
 * runs at the end of the seed.
 */
export async function placeSampleForPublication(
  dataSource: DataSource,
  submissionId: string,
  disciplineLabel: string | null | undefined,
  press: SeededPress,
): Promise<JournalIssue> {
  const slug = journalSlugForSampleLabel(disciplineLabel);
  const journal = press.journalsBySlug.get(slug);
  if (!journal) {
    throw new Error(`Seed: no journal row for slug "${slug}"`);
  }
  const issue = press.publishedIssueByJournalId.get(journal.id);
  if (!issue) {
    throw new Error(
      `Seed: journal "${slug}" has no published issue to file into`,
    );
  }
  await dataSource
    .getRepository(Submission)
    .update(submissionId, { journalId: journal.id });
  return issue;
}

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
