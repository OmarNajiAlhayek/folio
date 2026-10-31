import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { JournalSection } from '../entities/journal-section.entity';
import { SectionEditorAssignment } from '../entities/section-editor-assignment.entity';
import { SectionEditorLink } from '../entities/section-editor.entity';
import { Submission } from '../entities/submission.entity';
import { JournalMembershipService } from '../journals/journal-membership.service';
import { ROLE_SLUGS } from '../rbac/permission-slugs';

type RouteTarget = { userId: string; canRecordDecision: boolean };

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
    if (existing.length > 0) {
      return existing.map((row) => row.sectionEditorId);
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

  /** People already assigned to this submission. Workflow mail goes only here. */
  async assigneeIds(submissionId: string): Promise<string[]> {
    const rows = await this.assignmentsRepo.find({
      where: { submissionId },
      select: ['sectionEditorId'],
    });
    return rows.map((row) => row.sectionEditorId);
  }

  private async targetsFor(submission: Submission): Promise<RouteTarget[]> {
    if (!submission.sectionId) return [];
    const links = await this.linksRepo.find({
      where: { sectionId: submission.sectionId },
    });
    if (links.length > 0) {
      return links.map((link) => ({
        userId: link.userId,
        canRecordDecision: link.canRecordDecision,
      }));
    }
    const chiefs = await this.memberships.listUserIdsForJournal(
      submission.journalId,
      ROLE_SLUGS.EDITOR,
    );
    if (chiefs.length === 1) {
      return [{ userId: chiefs[0], canRecordDecision: true }];
    }
    if (chiefs.length > 1) return [];
    const managers = await this.memberships.listUserIdsForJournal(
      submission.journalId,
      ROLE_SLUGS.JOURNAL_MANAGER,
    );
    if (managers.length === 1) {
      return [{ userId: managers[0], canRecordDecision: true }];
    }
    return [];
  }
}
