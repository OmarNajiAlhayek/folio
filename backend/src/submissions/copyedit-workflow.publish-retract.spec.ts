import { BadRequestException, ForbiddenException } from '@nestjs/common';

jest.mock('./submission-response.mapper', () => ({
  submissionToViewerJson: jest.fn((s: unknown) => s),
}));
jest.mock('./assignment-response.mapper', () => ({
  copyeditAssignmentToEditorJson: jest.fn((a: unknown) => a),
}));

import { CopyeditWorkflowService } from './copyedit-workflow.service';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { CopyeditAssignmentStatus } from '../entities/copyedit-assignment.entity';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';
import type { RequestUser } from '../common/types/request-user';
import { claimStatusTransition } from './claim-status-transition';
import {
  clearPublicSubmissionFiles,
  setPublishedManuscriptFile,
} from './publish-public-files';

jest.mock('./claim-status-transition', () => ({
  claimStatusTransition: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./publish-public-files', () => ({
  setPublishedManuscriptFile: jest.fn().mockResolvedValue('file-1'),
  clearPublicSubmissionFiles: jest.fn().mockResolvedValue(undefined),
}));

describe('CopyeditWorkflowService publish override and retract', () => {
  const copyeditor: RequestUser = {
    sub: 'ce-1',
    email: 'ce@test.dev',
    roleSlugs: ['copyeditor'],
    permissionSlugs: [PERMISSION_SLUGS.COPYEDIT_PUBLISH],
  };
  const editor: RequestUser = {
    sub: 'ed-1',
    email: 'ed@test.dev',
    roleSlugs: ['editor'],
    permissionSlugs: [
      PERMISSION_SLUGS.COPYEDIT_PUBLISH,
      PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
    ],
  };

  let service: CopyeditWorkflowService;
  let access: {
    getBySlugOrThrow: jest.Mock;
    assertEditorQueueSubmissionVisible: jest.Mock;
    hasPerm: jest.Mock;
  };
  let copyeditAssignmentsRepo: { find: jest.Mock };
  let events: {
    enqueueSubmissionPublishedEvent: jest.Mock;
    enqueueSubmissionRetractedNotification: jest.Mock;
    emitPendingNotifications: jest.Mock;
  };
  let catalog: { enqueuePublishedSubmissionForSimilarity: jest.Mock };
  let searchService: {
    isEnabled: jest.Mock;
    upsertDocument: jest.Mock;
    deleteDocument: jest.Mock;
  };
  let submission: {
    id: string;
    slug: string;
    title: string;
    status: SubmissionStatus;
    authorId: string;
    publishedAt?: Date;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    submission = {
      id: 'sub-1',
      slug: 'paper-one',
      title: 'Paper',
      status: SubmissionStatus.COPYEDITING,
      authorId: 'auth-1',
    };
    access = {
      getBySlugOrThrow: jest.fn().mockResolvedValue(submission),
      assertEditorQueueSubmissionVisible: jest.fn(),
      hasPerm: jest.fn((user: RequestUser, slug: string) =>
        user.permissionSlugs.includes(slug),
      ),
    };
    copyeditAssignmentsRepo = { find: jest.fn() };
    events = {
      enqueueSubmissionPublishedEvent: jest.fn().mockResolvedValue(null),
      enqueueSubmissionRetractedNotification: jest.fn().mockResolvedValue(null),
      emitPendingNotifications: jest.fn(),
    };
    catalog = {
      enqueuePublishedSubmissionForSimilarity: jest
        .fn()
        .mockResolvedValue(undefined),
    };
    searchService = {
      isEnabled: jest.fn().mockReturnValue(false),
      upsertDocument: jest.fn().mockResolvedValue(undefined),
      deleteDocument: jest.fn().mockResolvedValue(undefined),
    };

    const submissionsRepo = {
      manager: {
        transaction: jest.fn((fn: (em: unknown) => unknown) => {
          const em = {
            getRepository: () => ({
              save: jest.fn((row: unknown) => Promise.resolve(row)),
            }),
          };
          return fn(em);
        }),
      },
    };

    service = new CopyeditWorkflowService(
      submissionsRepo as never,
      {} as never,
      copyeditAssignmentsRepo as never,
      {} as never,
      { findOne: jest.fn() } as never,
      {} as never,
      access as never,
      events as never,
      catalog as never,
      {} as never,
      searchService as never,
    );
  });

  it('lets the assigned copyeditor publish when every assignment is ready', async () => {
    copyeditAssignmentsRepo.find.mockResolvedValue([
      {
        copyeditorId: copyeditor.sub,
        status: CopyeditAssignmentStatus.READY_FOR_REVIEW,
      },
    ]);

    const saved = await service.publishSubmission('paper-one', copyeditor);
    expect(saved.status).toBe(SubmissionStatus.PUBLISHED);
    expect(setPublishedManuscriptFile).toHaveBeenCalled();
    expect(claimStatusTransition).toHaveBeenCalled();
  });

  it('lets a chief editor publish without being the assigned copyeditor', async () => {
    copyeditAssignmentsRepo.find.mockResolvedValue([
      {
        copyeditorId: 'someone-else',
        status: CopyeditAssignmentStatus.READY_FOR_REVIEW,
      },
    ]);

    const saved = await service.publishSubmission('paper-one', editor);
    expect(saved.status).toBe(SubmissionStatus.PUBLISHED);
  });

  it('still blocks an unassigned copyeditor', async () => {
    copyeditAssignmentsRepo.find.mockResolvedValue([
      {
        copyeditorId: 'someone-else',
        status: CopyeditAssignmentStatus.READY_FOR_REVIEW,
      },
    ]);

    await expect(
      service.publishSubmission('paper-one', copyeditor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('retracts a published article and demotes public files', async () => {
    submission.status = SubmissionStatus.PUBLISHED;

    const saved = await service.retractSubmission('paper-one', editor);
    expect(saved.status).toBe(SubmissionStatus.RETRACTED);
    expect(clearPublicSubmissionFiles).toHaveBeenCalled();
    expect(events.enqueueSubmissionRetractedNotification).toHaveBeenCalled();
  });

  it('refuses to retract a non-published submission', async () => {
    await expect(
      service.retractSubmission('paper-one', editor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses retract from a caller without the editor queue permission', async () => {
    submission.status = SubmissionStatus.PUBLISHED;
    await expect(
      service.retractSubmission('paper-one', copyeditor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
