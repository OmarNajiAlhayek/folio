import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubmissionsService } from './submissions.service';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { SubmissionFile } from '../entities/submission-file.entity';
import { ReviewAssignment } from '../entities/review-assignment.entity';
import { Review } from '../entities/review.entity';
import { CopyeditAssignment } from '../entities/copyedit-assignment.entity';
import { CopyeditNote } from '../entities/copyedit-note.entity';
import { User } from '../entities/user.entity';
import { RbacService } from '../rbac/rbac.service';
import { DocxGeneratorService } from './docx-generator.service';
import { ManuscriptStyleRegistryService } from '../manuscript-styles/manuscript-style-registry.service';
import { EventPublisherService } from '../messaging/event-publisher.service';
import { notificationsServiceMock } from '../notifications/notifications.service.mock';
import {
  PERMISSION_SLUGS,
  SUBMISSION_READ_PERMISSIONS,
} from '../rbac/permission-slugs';
import type { RequestUser } from '../common/types/request-user';

describe('SubmissionsService access (draft vs editor queue)', () => {
  let service: SubmissionsService;
  let assignmentsRepo: { exists: jest.Mock; find: jest.Mock };
  let copyeditAssignmentsRepo: { exists: jest.Mock; find: jest.Mock };
  let submissionsRepo: { findOne: jest.Mock };

  const draftSubmission: Submission = {
    id: 'sub-draft',
    slug: 'secret-draft',
    authorId: 'author-1',
    status: SubmissionStatus.DRAFT,
  } as Submission;

  const submittedSubmission: Submission = {
    id: 'sub-submitted',
    slug: 'paper-submitted',
    authorId: 'author-1',
    status: SubmissionStatus.SUBMITTED,
  } as Submission;

  const editorUser: RequestUser = {
    sub: 'editor-1',
    email: 'ed@test.dev',
    roleSlugs: ['editor'],
    permissionSlugs: [PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE],
  };

  const authorUser: RequestUser = {
    sub: 'author-1',
    email: 'author@test.dev',
    roleSlugs: ['author'],
    permissionSlugs: [PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN],
  };

  const listAssignmentsEditor: RequestUser = {
    sub: 'editor-2',
    email: 'ed2@test.dev',
    roleSlugs: ['editor'],
    permissionSlugs: [PERMISSION_SLUGS.SUBMISSION_LIST_ASSIGNMENTS],
  };

  beforeEach(async () => {
    assignmentsRepo = {
      exists: jest.fn().mockResolvedValue(false),
      find: jest.fn().mockResolvedValue([]),
    };
    copyeditAssignmentsRepo = {
      exists: jest.fn().mockResolvedValue(false),
      find: jest.fn().mockResolvedValue([]),
    };
    submissionsRepo = {
      findOne: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SubmissionsService,
        { provide: getRepositoryToken(Submission), useValue: submissionsRepo },
        { provide: getRepositoryToken(SubmissionFile), useValue: {} },
        {
          provide: getRepositoryToken(ReviewAssignment),
          useValue: assignmentsRepo,
        },
        { provide: getRepositoryToken(Review), useValue: {} },
        {
          provide: getRepositoryToken(CopyeditAssignment),
          useValue: copyeditAssignmentsRepo,
        },
        { provide: getRepositoryToken(CopyeditNote), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: RbacService, useValue: {} },
        { provide: DocxGeneratorService, useValue: {} },
        {
          provide: ManuscriptStyleRegistryService,
          useValue: {
            assertConstructorContentStyleKnown: jest.fn(),
            resolveEffectiveStyleId: jest
              .fn()
              .mockReturnValue('damascus-university-journal-v1'),
            getProfile: jest.fn(),
          },
        },
        { provide: EventPublisherService, useValue: { enqueue: jest.fn() } },
        notificationsServiceMock,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: string) => {
              if (key === 'APP_BASE_URL') return 'http://localhost:5240';
              return def;
            }),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(SubmissionsService);
  });

  describe('SUBMISSION_READ_PERMISSIONS', () => {
    it('includes every slug used by assertCanRead entry paths', () => {
      const slugs = new Set(SUBMISSION_READ_PERMISSIONS);
      expect(slugs.has(PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE)).toBe(
        true,
      );
      expect(slugs.has(PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN)).toBe(true);
      expect(slugs.has(PERMISSION_SLUGS.REVIEW_SUBMIT)).toBe(true);
      expect(slugs.has(PERMISSION_SLUGS.COPYEDIT_SUBMIT_NOTE)).toBe(true);
    });
  });

  describe('assertCanRead', () => {
    it('allows editor to read submitted submission', async () => {
      await expect(
        service.assertCanRead(submittedSubmission, editorUser),
      ).resolves.toBeUndefined();
    });

    it('denies editor read of draft with not found', async () => {
      await expect(
        service.assertCanRead(draftSubmission, editorUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('allows author to read own draft', async () => {
      await expect(
        service.assertCanRead(draftSubmission, authorUser),
      ).resolves.toBeUndefined();
    });

    it('denies unrelated user on draft', async () => {
      const stranger: RequestUser = {
        sub: 'stranger-1',
        email: 'x@test.dev',
        roleSlugs: [],
        permissionSlugs: [],
      };
      await expect(
        service.assertCanRead(draftSubmission, stranger),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('listAssignments', () => {
    it('denies listing assignments on a draft', async () => {
      jest
        .spyOn(service, 'getBySlugOrThrow')
        .mockResolvedValue(draftSubmission);

      await expect(
        service.listAssignments('secret-draft', listAssignmentsEditor),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(assignmentsRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('listCopyeditAssignments', () => {
    it('denies listing copyedit assignments on a draft', async () => {
      jest
        .spyOn(service, 'getBySlugOrThrow')
        .mockResolvedValue(draftSubmission);

      await expect(
        service.listCopyeditAssignments('secret-draft', editorUser),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(copyeditAssignmentsRepo.find).not.toHaveBeenCalled();
    });
  });
});
