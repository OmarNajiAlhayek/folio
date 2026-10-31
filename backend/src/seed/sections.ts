import { DataSource, Not, type Repository } from 'typeorm';
import { JournalMembership } from '../entities/journal-membership.entity';
import { JournalSection } from '../entities/journal-section.entity';
import { SectionEditorAssignment } from '../entities/section-editor-assignment.entity';
import { SectionEditorLink } from '../entities/section-editor.entity';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import type { User } from '../entities/user.entity';
import {
  ensureStaffMemberships,
  type SeededPress,
} from '../journals/seed-journals';
import { ROLE_SLUGS } from '../rbac/permission-slugs';

const LINKED_EN = 'Research articles';
const LINKED_AR = 'مقالات بحثية';
const OPEN_EN = 'Reviews';
const OPEN_AR = 'مراجعات';

/**
 * Reviewer membership is per journal. `reviewer@` is economics only,
 * `reviewer2` is law only, and `reviewer3` has none, so they cannot be invited.
 * Re-seed drops any other reviewer memberships so the demo stays that shape.
 */
export async function seedReviewerMemberships(
  dataSource: DataSource,
  press: SeededPress,
  reviewers: User[],
): Promise<void> {
  const repo = dataSource.getRepository(JournalMembership);
  await repo.delete({ roleSlug: ROLE_SLUGS.REVIEWER });
  const [reviewer, reviewer2] = reviewers;
  const econj = press.journalsBySlug.get('econj');
  const lawj = press.journalsBySlug.get('lawj');
  if (!reviewer || !reviewer2 || !econj || !lawj) {
    throw new Error(
      'Seed: reviewer memberships need econj, lawj, and two reviewers',
    );
  }
  await ensureStaffMemberships(
    dataSource,
    [econj],
    [{ userId: reviewer.id, roleSlug: ROLE_SLUGS.REVIEWER }],
  );
  await ensureStaffMemberships(
    dataSource,
    [lawj],
    [{ userId: reviewer2.id, roleSlug: ROLE_SLUGS.REVIEWER }],
  );
}

/**
 * Two sections per journal. Research articles is linked to that journal's
 * section editor. Reviews has no editor, so a submitted paper there is
 * assigned to the editor-in-chief.
 */
export async function seedSubmissionSections(
  dataSource: DataSource,
  press: SeededPress,
  sectionEditorBySlug: Map<string, User>,
): Promise<void> {
  const sections = dataSource.getRepository(JournalSection);
  const links = dataSource.getRepository(SectionEditorLink);
  const assignments = dataSource.getRepository(SectionEditorAssignment);
  const submissions = dataSource.getRepository(Submission);
  const memberships = dataSource.getRepository(JournalMembership);

  for (const [slug, journal] of press.journalsBySlug) {
    const editor = sectionEditorBySlug.get(slug);
    if (!editor) continue;
    const linked = await ensureSection(sections, journal.id, {
      nameEn: LINKED_EN,
      nameAr: LINKED_AR,
      sortOrder: 0,
    });
    await ensureSection(sections, journal.id, {
      nameEn: OPEN_EN,
      nameAr: OPEN_AR,
      sortOrder: 1,
    });
    const existing = await links.findOne({
      where: { sectionId: linked.id, userId: editor.id },
    });
    if (!existing) {
      await links.save(
        links.create({
          sectionId: linked.id,
          userId: editor.id,
          canRecordDecision: true,
        }),
      );
    }
  }

  const rows = await submissions.find({
    where: { status: Not(SubmissionStatus.DRAFT) },
    select: ['id', 'journalId', 'status', 'authorId'],
  });
  const sectionRows = await sections.find();
  const byJournal = new Map<string, { linked?: string; open?: string }>();
  for (const section of sectionRows) {
    const bucket = byJournal.get(section.journalId) ?? {};
    if (section.nameEn === LINKED_EN) bucket.linked = section.id;
    if (section.nameEn === OPEN_EN) bucket.open = section.id;
    byJournal.set(section.journalId, bucket);
  }

  for (const row of rows) {
    const bucket = byJournal.get(row.journalId);
    if (!bucket?.linked || !bucket.open) continue;
    const unassignedSection = row.status === SubmissionStatus.SUBMITTED;
    const sectionId = unassignedSection ? bucket.open : bucket.linked;
    await submissions.update(row.id, { sectionId });
    const already = await assignments.count({
      where: { submissionId: row.id },
    });
    if (already > 0) continue;
    const role = unassignedSection
      ? ROLE_SLUGS.EDITOR
      : ROLE_SLUGS.SECTION_EDITOR;
    const holder = await memberships.findOne({
      where: { journalId: row.journalId, roleSlug: role },
    });
    if (!holder) continue;
    await assignments.save(
      assignments.create({
        submissionId: row.id,
        sectionEditorId: holder.userId,
        assignedById: row.authorId,
        canRecordDecision: true,
        recommendation: null,
      }),
    );
  }

  const drafts = await submissions.find({
    where: { status: SubmissionStatus.DRAFT },
    select: ['id', 'journalId', 'sectionId'],
  });
  for (const draft of drafts) {
    if (draft.sectionId) continue;
    const linked = byJournal.get(draft.journalId)?.linked;
    if (linked) await submissions.update(draft.id, { sectionId: linked });
  }
}

async function ensureSection(
  repo: Repository<JournalSection>,
  journalId: string,
  spec: { nameEn: string; nameAr: string; sortOrder: number },
): Promise<JournalSection> {
  const found = await repo.findOne({
    where: { journalId, nameEn: spec.nameEn },
  });
  if (found) return found;
  return repo.save(
    repo.create({
      journalId,
      nameEn: spec.nameEn,
      nameAr: spec.nameAr,
      sortOrder: spec.sortOrder,
      isActive: true,
    }),
  );
}
