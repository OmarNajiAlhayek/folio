import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { JournalSection } from '../entities/journal-section.entity';
import { SectionEditorAssignment } from '../entities/section-editor-assignment.entity';
import { SectionEditorLink } from '../entities/section-editor.entity';
import { Submission } from '../entities/submission.entity';
import { JournalMembershipService } from '../journals/journal-membership.service';
import { resolveRouteTargets } from '../journals/route-targets';

/**
 * Who a new submission is handed to, in OJS order:
 * every section editor linked to the chosen section; otherwise the single
 * editor-in-chief; otherwise the single journal manager; otherwise nobody.
 * A later submit of the same paper does not add another round of assignees.
 */
@Injectable()
export class SubmissionRoutingService {
  constructor(
    @InjectRepository(JournalSection)
    private readonly sectionsRepo: Repository<JournalSection>,
    @InjectRepository(SectionEditorLink)
    private readonly linksRepo: Repository<SectionEditorLink>,
    @InjectRepository(SectionEditorAssignment)
    private readonly assignmentsRepo: Repository<SectionEditorAssignment>,
    private readonly memberships: JournalMembershipService,
  ) {}

  async assertReadySection(
    sectionId: string | null,
    journalId: string,
  ): Promise<void> {
    if (!sectionId) {
      throw new BadRequestException({
        message: 'Choose a section before submitting',
        code: 'SECTION_REQUIRED',
      });
    }
    const section = await this.sectionsRepo.findOne({
      where: { id: sectionId },
    });
    if (!section || section.journalId !== journalId || !section.isActive) {
      throw new BadRequestException({
        message: 'That section is not an active section of this journal',
        code: 'SECTION_NOT_IN_JOURNAL',
      });
    }
  }

  /** Active section of this journal, or null when the id is empty. */
  async sectionForJournal(
    sectionId: string,
    journalId: string,
  ): Promise<JournalSection> {
    const section = await this.sectionsRepo.findOne({
      where: { id: sectionId, journalId, isActive: true },
    });
    if (!section) {
      throw new BadRequestException({
        message: 'That section is not an active section of this journal',
        code: 'SECTION_NOT_IN_JOURNAL',
      });
    }
    return section;
  }

  /**
   * Writes assignment rows inside the submit transaction and returns the
   * user ids who should receive workflow mail. Existing assignees are kept
   * and mailed again on a resubmission.
   */
  async routeOnSubmit(
    em: EntityManager,
    submission: Submission,
    actorId: string,
  ): Promise<string[]> {
    const repo = em.getRepository(SectionEditorAssignment);
    const existing = await repo.find({
      where: { submissionId: submission.id },
      select: ['sectionEditorId'],
    });
    const seated = await this.memberships.filterStaffUserIdsInJournal(
      existing.map((row) => row.sectionEditorId),
      submission.journalId,
    );
    if (seated.length > 0) {
      return seated;
    }
    const targets = await this.targetsFor(submission);
    if (targets.length === 0) return [];
    await repo.save(
      targets.map((target) =>
        repo.create({
          submissionId: submission.id,
          sectionEditorId: target.userId,
          assignedById: actorId,
          canRecordDecision: target.canRecordDecision,
          recommendation: null,
        }),
      ),
    );
    return targets.map((target) => target.userId);
  }

  /**
   * People assigned to this submission who still hold a seat on its journal.
   * Workflow mail goes only here, so someone who lost their role or journal
   * stops receiving it even if an old assignment row remains.
   */
  async assigneeIds(submissionId: string): Promise<string[]> {
    const rows = await this.assignmentsRepo.find({
      where: { submissionId },
      select: ['sectionEditorId'],
    });
    if (rows.length === 0) return [];
    const submission = await this.assignmentsRepo.manager
      .getRepository(Submission)
      .findOne({ where: { id: submissionId }, select: ['id', 'journalId'] });
    if (!submission) return [];
    return this.memberships.filterStaffUserIdsInJournal(
      rows.map((row) => row.sectionEditorId),
      submission.journalId,
    );
  }

  private targetsFor(submission: Submission) {
    return resolveRouteTargets(
      { linksRepo: this.linksRepo, memberships: this.memberships },
      submission,
    );
  }
}
