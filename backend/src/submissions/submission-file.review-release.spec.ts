import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubmissionFileService } from './submission-file.service';
import { SubmissionAccessService } from './submission-access.service';
import { ManuscriptStyleRegistryService } from '../manuscript-styles/manuscript-style-registry.service';
import { JournalDirectoryService } from '../journals/journal-directory.service';
import { languageToolServiceMock } from './language-tool.service.mock';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { SubmissionFile } from '../entities/submission-file.entity';
import { ReviewAssignment } from '../entities/review-assignment.entity';
import { CopyeditAssignment } from '../entities/copyedit-assignment.entity';
import { SectionEditorAssignment } from '../entities/section-editor-assignment.entity';
import { User } from '../entities/user.entity';
import type { RequestUser } from '../common/types/request-user';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';

/**
 * The author owns every other file on their submission, so `getFileForUser`
 * short-circuits on `isAuthor`. A reviewer's review file is the one exception:
 * it stays editor-only until an editor releases it.
 */
describe('SubmissionFileService reviewer review file release', () => {
  const submission = {
    id: 'sub-1',
    slug: 'paper-one',
    authorId: 'author-1',
    status: SubmissionStatus.UNDER_REVIEW,
  } as Submission;

  const author: RequestUser = {
    sub: 'author-1',
    permissionSlugs: [PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN],
  } as unknown as RequestUser;

  const editor: RequestUser = {
    sub: 'editor-1',
    permissionSlugs: [
      PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
      PERMISSION_SLUGS.SUBMISSION_CHANGE_STATUS,
    ],
  } as unknown as RequestUser;

  function reviewFile(overrides: Partial<SubmissionFile> = {}) {
    return {
      id: 'file-1',
      submissionId: 'sub-1',
      storageKey: 'abc.docx',
      originalName: 'Dr Amina Haddad - annotated.docx',
      mimeType: 'application/octet-stream',
      kind: 'review_response',
      reviewAssignmentId: 'asg-2',
      releasedToAuthorAt: null,
      releasedById: null,
      submission,
      ...overrides,
    } as SubmissionFile;
  }

  let service: SubmissionFileService;
  let filesRepo: {
    findOne: jest.Mock;
    find: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };
  let assignmentsRepo: { find: jest.Mock; findOne: jest.Mock };

  beforeEach(async () => {
    filesRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([{ id: 'asg-1' }, { id: 'asg-2' }]),
      save: jest.fn((f: SubmissionFile) => Promise.resolve(f)),
      remove: jest.fn(),
    };
    assignmentsRepo = {
      // Ordered by assignedAt: asg-2 is the second reviewer.
      find: jest.fn().mockResolvedValue([{ id: 'asg-1' }, { id: 'asg-2' }]),
      findOne: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SubmissionFileService,
        SubmissionAccessService,
        {
          provide: getRepositoryToken(Submission),
          useValue: { findOne: jest.fn().mockResolvedValue(submission) },
        },
        { provide: getRepositoryToken(SubmissionFile), useValue: filesRepo },
        {
          provide: getRepositoryToken(ReviewAssignment),
          useValue: assignmentsRepo,
        },
        { provide: getRepositoryToken(CopyeditAssignment), useValue: {} },
        { provide: getRepositoryToken(SectionEditorAssignment), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: ManuscriptStyleRegistryService, useValue: {} },
        { provide: JournalDirectoryService, useValue: {} },
        languageToolServiceMock,
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(SubmissionFileService);
  });

  it('refuses the author an unreleased reviewer review file', async () => {
    filesRepo.findOne.mockResolvedValue(reviewFile());
    await expect(
      service.getFileForUser('paper-one', 'file-1', author),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('serves it to the author once released, under an anonymized name', async () => {
    filesRepo.findOne.mockResolvedValue(
      reviewFile({ releasedToAuthorAt: new Date('2026-02-01') }),
    );
    const result = await service.getFileForUser('paper-one', 'file-1', author);
    expect(result.downloadName).toBe('Reviewer 2 — review file.docx');
    expect(result.downloadName).not.toContain('Amina');
  });

  it('always serves editors the real filename', async () => {
    filesRepo.findOne.mockResolvedValue(reviewFile());
    const result = await service.getFileForUser('paper-one', 'file-1', editor);
    expect(result.downloadName).toBe('Dr Amina Haddad - annotated.docx');
  });

  it('records who released the file, and can revoke it', async () => {
    filesRepo.findOne.mockResolvedValue(reviewFile());
    const released = await service.setReviewFileRelease(
      'paper-one',
      'file-1',
      editor,
      true,
    );
    expect(released.releasedToAuthorAt).toBeInstanceOf(Date);
    expect(released.releasedById).toBe('editor-1');

    filesRepo.findOne.mockResolvedValue(
      reviewFile({ releasedToAuthorAt: new Date(), releasedById: 'editor-1' }),
    );
    const revoked = await service.setReviewFileRelease(
      'paper-one',
      'file-1',
      editor,
      false,
    );
    expect(revoked.releasedToAuthorAt).toBeNull();
    expect(revoked.releasedById).toBeNull();
  });

  it('refuses to release anything that is not a reviewer review file', async () => {
    filesRepo.findOne.mockResolvedValue(reviewFile({ kind: 'manuscript' }));
    await expect(
      service.setReviewFileRelease('paper-one', 'file-1', editor, true),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lets a reviewer withdraw their own file only before it is released', async () => {
    assignmentsRepo.findOne.mockResolvedValue({
      id: 'asg-2',
      submissionId: 'sub-1',
    });
    filesRepo.findOne.mockResolvedValue(
      reviewFile({ releasedToAuthorAt: new Date() }),
    );
    await expect(
      service.deleteReviewerFile('asg-slug', 'reviewer-2', 'file-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    filesRepo.findOne.mockResolvedValue(reviewFile());
    await service.deleteReviewerFile('asg-slug', 'reviewer-2', 'file-1');
    expect(filesRepo.remove).toHaveBeenCalled();
  });
});
