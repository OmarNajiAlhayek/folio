import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { SectionEditorAssignment } from '../entities/section-editor-assignment.entity';
import { User } from '../entities/user.entity';
import type { RequestUser } from '../common/types/request-user';
import { assertCallerPermission } from '../common/authorization/permission-checks';
import { JournalMembershipService } from '../journals/journal-membership.service';
import { PERMISSION_SLUGS, ROLE_SLUGS } from '../rbac/permission-slugs';
import { RbacService } from '../rbac/rbac.service';
import { SubmissionAccessService } from './submission-access.service';
import { SubmissionEventsService } from './submission-events.service';

export type SectionEditorSuggestion = {
  userId: string;
  displayName: string;
  email: string;
  matchingDisciplines: string[];
  activeAssignmentCount: number;
};

export type SectionEditorSuggestionsReport =
  | { status: 'no_disciplines' }
  | { status: 'no_candidates' }
  | { status: 'ok'; suggestions: SectionEditorSuggestion[] };

export type SectionEditorCandidate = {
  id: string;
  displayName: string;
  email: string;
  disciplines: string[];
};

@Injectable()
export class SectionEditorWorkflowService {
  constructor(
    @InjectRepository(SectionEditorAssignment)
    private readonly seAssignmentsRepo: Repository<SectionEditorAssignment>,
    @InjectRepository(Submission)
    private readonly submissionsRepo: Repository<Submission>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly rbacService: RbacService,
    private readonly access: SubmissionAccessService,
    private readonly events: SubmissionEventsService,
    private readonly journalMemberships: JournalMembershipService,
    private readonly config: ConfigService,
  ) {}

  private appBaseUrl(): string {
    return (
      this.config.get<string>('APP_BASE_URL') ?? 'http://localhost:5240'
    ).replace(/\/+$/, '');
  }

  async assignSectionEditor(
    submissionSlug: string,
    sectionEditorId: string,
    caller: RequestUser,
    folioLocale?: string,
  ): Promise<SectionEditorAssignment> {
    assertCallerPermission(
      caller,
      PERMISSION_SLUGS.SUBMISSION_ASSIGN_SECTION_EDITOR,
    );

    const submission = await this.access.getBySlugOrThrow(submissionSlug);
    this.access.assertEditorQueueSubmissionVisible(submission);

    const hasSectionEditorRole = await this.rbacService.userHasPermission(
      sectionEditorId,
      PERMISSION_SLUGS.SUBMISSION_VIEW_SECTION_QUEUE,
    );
    if (!hasSectionEditorRole) {
      throw new BadRequestException({
        message: 'Target user does not have the section editor role',
        code: 'VALIDATION_ERROR',
      });
    }

    const [sectionEditor, callerUser] = await Promise.all([
      this.usersRepo.findOne({ where: { id: sectionEditorId } }),
      this.usersRepo.findOne({
        where: { id: caller.sub },
        select: ['id', 'displayName'],
      }),
    ]);
    if (!sectionEditor) {
      throw new NotFoundException({
        message: 'Section editor user not found',
        code: 'NOT_FOUND',
      });
    }

    await this.seAssignmentsRepo.delete({ submissionId: submission.id });

    const assignment = this.seAssignmentsRepo.create({
      submissionId: submission.id,
      sectionEditorId,
      assignedById: caller.sub,
    });
    const saved = await this.seAssignmentsRepo.save(assignment);

    await this.events.enqueueSectionEditorAssignedEvent({
      submission,
      sectionEditor,
      assignedById: caller.sub,
      assignedByDisplayName: callerUser?.displayName ?? '',
      folioLocale,
    });

    return saved;
  }

  async removeSectionEditorAssignment(
    submissionSlug: string,
    caller: RequestUser,
  ): Promise<void> {
    assertCallerPermission(
      caller,
      PERMISSION_SLUGS.SUBMISSION_ASSIGN_SECTION_EDITOR,
    );
    const submission = await this.access.getBySlugOrThrow(submissionSlug);
    await this.seAssignmentsRepo.delete({ submissionId: submission.id });
  }

  async getSuggestedSectionEditors(
    submissionSlug: string,
    caller: RequestUser,
  ): Promise<SectionEditorSuggestionsReport> {
    assertCallerPermission(
      caller,
      PERMISSION_SLUGS.SUBMISSION_ASSIGN_SECTION_EDITOR,
    );

    const submission = await this.access.getBySlugOrThrow(submissionSlug);

    // Candidates are now the section editors of the submission's journal, not
    // everyone tagged with a matching discipline. `journal_id` is nullable
    // until the author picker lands, so an unplaced submission still reports
    // `no_disciplines` — the wire value the UI already renders as "nothing to
    // match on".
    const journalId = submission.journalId;
    if (!journalId) {
      return { status: 'no_disciplines' };
    }

    const candidateIds = await this.rbacService.listUserIdsWithPermission(
      PERMISSION_SLUGS.SUBMISSION_VIEW_SECTION_QUEUE,
    );
    if (candidateIds.length === 0) {
      return { status: 'no_candidates' };
    }

    const [matchingIds, journalLabel] = await Promise.all([
      this.journalMemberships.filterUserIdsInJournal(
        candidateIds,
        journalId,
        ROLE_SLUGS.SECTION_EDITOR,
      ),
      this.journalMemberships.disciplineLabelForJournal(journalId),
    ]);
    if (matchingIds.length === 0) {
      return { status: 'no_candidates' };
    }
    const matchingDisciplines = journalLabel ? [journalLabel] : [];

    const activeCountRows = await this.seAssignmentsRepo
      .createQueryBuilder('a')
      .select('a.section_editor_id', 'sectionEditorId')
      .addSelect('COUNT(*)', 'cnt')
      .where('a.section_editor_id IN (:...ids)', { ids: matchingIds })
      .groupBy('a.section_editor_id')
      .getRawMany<{ sectionEditorId: string; cnt: string }>();

    const countMap = new Map(
      activeCountRows.map((r) => [r.sectionEditorId, parseInt(r.cnt, 10)]),
    );

    const users = await this.usersRepo.find({
      where: { id: In(matchingIds) },
      select: ['id', 'displayName', 'email'],
    });

    const suggestions: SectionEditorSuggestion[] = users.map((u) => ({
      userId: u.id,
      displayName: u.displayName,
      email: u.email,
      matchingDisciplines,
      activeAssignmentCount: countMap.get(u.id) ?? 0,
    }));

    suggestions.sort(
      (a, b) =>
        a.activeAssignmentCount - b.activeAssignmentCount ||
        a.displayName.localeCompare(b.displayName),
    );

    return { status: 'ok', suggestions };
  }

  async listSectionQueue(
    sectionEditorId: string,
    status?: SubmissionStatus,
  ): Promise<Submission[]> {
    const assignments = await this.seAssignmentsRepo.find({
      where: { sectionEditorId },
      select: ['submissionId'],
    });
    if (assignments.length === 0) return [];

    const submissionIds = assignments.map((a) => a.submissionId);
    const qb = this.submissionsRepo
      .createQueryBuilder('s')
      .where('s.id IN (:...ids)', { ids: submissionIds })
      .orderBy('s.updatedAt', 'DESC');
    if (status) {
      qb.andWhere('s.status = :status', { status });
    }
    return qb.getMany();
  }

  async getSectionEditorForSubmission(
    submissionId: string,
  ): Promise<SectionEditorAssignment | null> {
    return this.seAssignmentsRepo.findOne({
      where: { submissionId },
      relations: ['sectionEditor'],
    });
  }

  async listCandidates(): Promise<SectionEditorCandidate[]> {
    const candidateIds = await this.rbacService.listUserIdsWithPermission(
      PERMISSION_SLUGS.SUBMISSION_VIEW_SECTION_QUEUE,
    );
    if (candidateIds.length === 0) return [];

    const [users, disciplineMap] = await Promise.all([
      this.usersRepo.find({
        where: { id: In(candidateIds) },
        select: ['id', 'displayName', 'email'],
      }),
      this.journalMemberships.disciplineLabelsByUser(
        candidateIds,
        ROLE_SLUGS.SECTION_EDITOR,
      ),
    ]);

    return users.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      email: u.email,
      disciplines: disciplineMap.get(u.id) ?? [],
    }));
  }
}
