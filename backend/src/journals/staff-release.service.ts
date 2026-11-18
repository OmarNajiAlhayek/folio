import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Journal } from '../entities/journal.entity';
import { JournalSection } from '../entities/journal-section.entity';
import { SectionEditorAssignment } from '../entities/section-editor-assignment.entity';
import { SectionEditorLink } from '../entities/section-editor.entity';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { ROLE_SLUGS } from '../rbac/permission-slugs';
import { JournalMembershipService } from './journal-membership.service';
import { resolveRouteTargets } from './route-targets';

/** Papers still moving through the workflow. Published and closed ones keep their history. */
const OPEN_STATUSES = [
  SubmissionStatus.SUBMITTED,
  SubmissionStatus.UNDER_REVIEW,
  SubmissionStatus.REVISIONS_REQUESTED,
  SubmissionStatus.ACCEPTED,
  SubmissionStatus.COPYEDITING,
];

/**
 * Takes a person off a journal's papers when they lose their seat there.
 *
 * A paper's assignees and a section's editor links are written once, at submit
 * and when a manager links someone. Taking a role or a journal away from a
 * person did not touch them, so that person kept receiving notifications and
 * email for a journal they no longer serve, and new papers kept being routed
 * to them. This removes both and hands any paper left without an assignee to
 * whoever now holds the seat.
 */
@Injectable()
export class StaffReleaseService {
  constructor(
    @InjectRepository(Journal)
    private readonly journalsRepo: Repository<Journal>,
    @InjectRepository(JournalSection)
    private readonly sectionsRepo: Repository<JournalSection>,
    @InjectRepository(SectionEditorLink)
    private readonly linksRepo: Repository<SectionEditorLink>,
    @InjectRepository(SectionEditorAssignment)
    private readonly assignmentsRepo: Repository<SectionEditorAssignment>,
    @InjectRepository(Submission)
    private readonly submissionsRepo: Repository<Submission>,
    private readonly memberships: JournalMembershipService,
  ) {}

  /**
   * For a role taken away everywhere: checks every journal, including ones the
   * person only reached through a leftover section link.
   */
  async releaseUserFromAllJournals(
    userId: string,
    reassignedById: string = userId,
  ): Promise<void> {
    const journals = await this.journalsRepo.find({ select: ['id'] });
    await this.releaseUserFromJournals(
      userId,
      journals.map((j) => j.id),
      reassignedById,
    );
  }

  /**
   * Call after the person's memberships have been changed. For each journal
   * where they no longer hold the seat:
   *  - their section links there are removed (unless they are still a section
   *    editor of that journal);
   *  - they are taken off its open papers (unless they still hold any editor,
   *    manager or section-editor seat there), and papers left with nobody are
   *    routed again.
   */
  async releaseUserFromJournals(
    userId: string,
    journalIds: string[],
    reassignedById: string = userId,
  ): Promise<void> {
    for (const journalId of new Set(journalIds)) {
      const stillSectionEditor =
        (
          await this.memberships.filterUserIdsInJournal(
            [userId],
            journalId,
            ROLE_SLUGS.SECTION_EDITOR,
          )
        ).length > 0;
      if (!stillSectionEditor) {
        const sections = await this.sectionsRepo.find({
          where: { journalId },
          select: ['id'],
        });
        if (sections.length > 0) {
          await this.linksRepo.delete({
            userId,
            sectionId: In(sections.map((s) => s.id)),
          });
        }
      }

      const stillStaff =
        (
          await this.memberships.filterStaffUserIdsInJournal(
            [userId],
            journalId,
          )
        ).length > 0;
      if (stillStaff) continue;

      const papers = await this.submissionsRepo.find({
        where: { journalId, status: In(OPEN_STATUSES) },
        select: ['id', 'journalId', 'sectionId'],
      });
      if (papers.length === 0) continue;
      const mine = await this.assignmentsRepo.find({
        where: {
          sectionEditorId: userId,
          submissionId: In(papers.map((p) => p.id)),
        },
        select: ['id', 'submissionId'],
      });
      if (mine.length === 0) continue;
      await this.assignmentsRepo.delete({ id: In(mine.map((m) => m.id)) });

      const touched = new Set(mine.map((m) => m.submissionId));
      for (const paper of papers) {
        if (!touched.has(paper.id)) continue;
        const left = await this.assignmentsRepo.count({
          where: { submissionId: paper.id },
        });
        if (left > 0) continue;
        const targets = await resolveRouteTargets(
          { linksRepo: this.linksRepo, memberships: this.memberships },
          paper,
        );
        if (targets.length === 0) continue;
        await this.assignmentsRepo.save(
          targets.map((target) =>
            this.assignmentsRepo.create({
              submissionId: paper.id,
              sectionEditorId: target.userId,
              assignedById: reassignedById,
              canRecordDecision: target.canRecordDecision,
              recommendation: null,
            }),
          ),
        );
      }
    }
  }
}
