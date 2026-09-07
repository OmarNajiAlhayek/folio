/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return */
import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { SectionEditorAssignment } from '../entities/section-editor-assignment.entity';
import { JournalIssuesService } from '../journals/journal-issues.service';
import { JournalMembershipService } from '../journals/journal-membership.service';
import { User } from '../entities/user.entity';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';
import { RbacService } from '../rbac/rbac.service';
import { SubmissionAccessService } from './submission-access.service';
import { SubmissionEventsService } from './submission-events.service';
import { SectionEditorWorkflowService } from './section-editor-workflow.service';
import type { RequestUser } from '../common/types/request-user';

const EDITOR_USER: RequestUser = {
  sub: 'editor-1',
  email: 'editor@test.dev',
  roleSlugs: ['editor'],
  permissionSlugs: [PERMISSION_SLUGS.SUBMISSION_ASSIGN_SECTION_EDITOR],
};

const SUBMISSION: Submission = {
  id: 'sub-id-1',
  slug: 'test-paper',
  title: 'Test Paper',
  status: SubmissionStatus.SUBMITTED,
  disciplines: ['العلوم الطبية'],
  journalId: 'journal-medj',
} as Submission;

const SECTION_EDITOR_ENTITY: User = {
  id: 'se-1',
  email: 'se@test.dev',
  displayName: 'Section Editor One',
} as User;

const CALLER_ENTITY: User = {
  id: 'editor-1',
  email: 'editor@test.dev',
  displayName: 'Chief Editor',
} as User;

describe('SectionEditorWorkflowService', () => {
  let service: SectionEditorWorkflowService;
  let seAssignmentsRepo: {
    delete: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let journalMemberships: {
    filterUserIdsInJournal: jest.Mock;
    disciplineLabelForJournal: jest.Mock;
    disciplineLabelsByUser: jest.Mock;
  };
  let submissionsRepo: { find: jest.Mock; createQueryBuilder: jest.Mock };
  let usersRepo: { findOne: jest.Mock; find: jest.Mock };
  let rbacService: {
    userHasPermission: jest.Mock;
    listUserIdsWithPermission: jest.Mock;
  };
  let access: {
    getBySlugOrThrow: jest.Mock;
    assertEditorQueueSubmissionVisible: jest.Mock;
  };
  let events: { enqueueSectionEditorAssignedEvent: jest.Mock };

  beforeEach(async () => {
    seAssignmentsRepo = {
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
      create: jest.fn((obj) => ({ ...obj, id: 'new-asg-id' })),
      save: jest.fn(async (obj) => obj),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn(),
    };
    journalMemberships = {
      filterUserIdsInJournal: jest.fn().mockResolvedValue([]),
      disciplineLabelForJournal: jest.fn().mockResolvedValue('العلوم الطبية'),
      disciplineLabelsByUser: jest.fn().mockResolvedValue(new Map()),
    };
    submissionsRepo = {
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn(),
    };
    usersRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
    };
    rbacService = {
      userHasPermission: jest.fn().mockResolvedValue(false),
      listUserIdsWithPermission: jest.fn().mockResolvedValue([]),
    };
    access = {
      getBySlugOrThrow: jest.fn().mockResolvedValue(SUBMISSION),
      assertEditorQueueSubmissionVisible: jest.fn(),
    };
    events = {
      enqueueSectionEditorAssignedEvent: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        SectionEditorWorkflowService,
        {
          provide: getRepositoryToken(SectionEditorAssignment),
          useValue: seAssignmentsRepo,
        },
        {
          provide: JournalMembershipService,
          useValue: journalMemberships,
        },
        {
          provide: JournalIssuesService,
          useValue: {
            listPublishableIssues: jest.fn().mockResolvedValue([]),
            getIssueAcceptingArticleOrThrow: jest.fn(),
          },
        },
        { provide: getRepositoryToken(Submission), useValue: submissionsRepo },
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: RbacService, useValue: rbacService },
        { provide: SubmissionAccessService, useValue: access },
        { provide: SubmissionEventsService, useValue: events },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('http://localhost:5240') },
        },
      ],
    }).compile();

    service = module.get(SectionEditorWorkflowService);
  });

  describe('assignSectionEditor', () => {
    it('throws ForbiddenException when caller lacks assign_section_editor', async () => {
      const unauthorizedCaller: RequestUser = {
        ...EDITOR_USER,
        permissionSlugs: [],
      };
      await expect(
        service.assignSectionEditor('test-paper', 'se-1', unauthorizedCaller),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when target lacks view_section_queue', async () => {
      rbacService.userHasPermission.mockResolvedValue(false);
      await expect(
        service.assignSectionEditor('test-paper', 'se-1', EDITOR_USER),
      ).rejects.toThrow(BadRequestException);
    });

    it('deletes existing assignment then creates new one', async () => {
      rbacService.userHasPermission.mockResolvedValue(true);
      usersRepo.findOne
        .mockResolvedValueOnce(SECTION_EDITOR_ENTITY)
        .mockResolvedValueOnce(CALLER_ENTITY);

      await service.assignSectionEditor('test-paper', 'se-1', EDITOR_USER);

      expect(seAssignmentsRepo.delete).toHaveBeenCalledWith({
        submissionId: SUBMISSION.id,
      });
      expect(seAssignmentsRepo.save).toHaveBeenCalled();
    });

    it('enqueues section editor assigned event', async () => {
      rbacService.userHasPermission.mockResolvedValue(true);
      usersRepo.findOne
        .mockResolvedValueOnce(SECTION_EDITOR_ENTITY)
        .mockResolvedValueOnce(CALLER_ENTITY);

      await service.assignSectionEditor(
        'test-paper',
        'se-1',
        EDITOR_USER,
        'ar',
      );

      expect(events.enqueueSectionEditorAssignedEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          submission: SUBMISSION,
          sectionEditor: SECTION_EDITOR_ENTITY,
          assignedById: EDITOR_USER.sub,
          folioLocale: 'ar',
        }),
      );
    });
  });

  describe('removeSectionEditorAssignment', () => {
    it('throws ForbiddenException without assign_section_editor perm', async () => {
      await expect(
        service.removeSectionEditorAssignment('test-paper', {
          ...EDITOR_USER,
          permissionSlugs: [],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deletes assignment row', async () => {
      await service.removeSectionEditorAssignment('test-paper', EDITOR_USER);
      expect(seAssignmentsRepo.delete).toHaveBeenCalledWith({
        submissionId: SUBMISSION.id,
      });
    });
  });

  describe('getSuggestedSectionEditors', () => {
    it('returns no_disciplines when the submission has no journal', async () => {
      access.getBySlugOrThrow.mockResolvedValue({
        ...SUBMISSION,
        journalId: null,
      });
      const result = await service.getSuggestedSectionEditors(
        'test-paper',
        EDITOR_USER,
      );
      expect(result.status).toBe('no_disciplines');
    });

    it('returns no_candidates when no users have view_section_queue', async () => {
      rbacService.listUserIdsWithPermission.mockResolvedValue([]);
      const result = await service.getSuggestedSectionEditors(
        'test-paper',
        EDITOR_USER,
      );
      expect(result.status).toBe('no_candidates');
    });

    it('returns no_candidates when no section editor serves the journal', async () => {
      rbacService.listUserIdsWithPermission.mockResolvedValue(['se-1']);
      journalMemberships.filterUserIdsInJournal.mockResolvedValue([]);
      const result = await service.getSuggestedSectionEditors(
        'test-paper',
        EDITOR_USER,
      );
      expect(result.status).toBe('no_candidates');
    });

    it('returns ok with candidates sorted by workload ASC', async () => {
      rbacService.listUserIdsWithPermission.mockResolvedValue(['se-1', 'se-2']);
      journalMemberships.filterUserIdsInJournal.mockResolvedValue([
        'se-1',
        'se-2',
      ]);

      const qb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { sectionEditorId: 'se-1', cnt: '3' },
          { sectionEditorId: 'se-2', cnt: '1' },
        ]),
      };
      seAssignmentsRepo.createQueryBuilder.mockReturnValue(qb);

      usersRepo.find.mockResolvedValue([
        { id: 'se-1', displayName: 'Alpha Editor', email: 'a@t.dev' },
        { id: 'se-2', displayName: 'Beta Editor', email: 'b@t.dev' },
      ]);

      const result = await service.getSuggestedSectionEditors(
        'test-paper',
        EDITOR_USER,
      );

      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;
      // se-2 has fewer active assignments → ranked first
      expect(result.suggestions[0].userId).toBe('se-2');
      expect(result.suggestions[0].activeAssignmentCount).toBe(1);
      expect(result.suggestions[1].userId).toBe('se-1');
      expect(result.suggestions[1].activeAssignmentCount).toBe(3);
    });

    it('throws ForbiddenException without assign_section_editor perm', async () => {
      await expect(
        service.getSuggestedSectionEditors('test-paper', {
          ...EDITOR_USER,
          permissionSlugs: [],
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
