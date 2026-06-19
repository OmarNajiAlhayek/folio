import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Submission } from '../entities/submission.entity';
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
import { aiClientServiceMock } from '../ai/ai-client.service.mock';
import { aiJobsServiceMock } from '../ai-jobs/ai-jobs.service.mock';
import { languageToolServiceMock } from './language-tool.service.mock';
import { SearchService } from '../search/search.service';
import type { TestingModule } from '@nestjs/testing';
import { SubmissionsService } from './submissions.service';
import { SubmissionAccessService } from './submission-access.service';
import { PublicationCatalogService } from './publication-catalog.service';
import { SubmissionFileService } from './submission-file.service';
import { SubmissionEventsService } from './submission-events.service';
import { ReviewWorkflowService } from './review-workflow.service';
import { CopyeditWorkflowService } from './copyedit-workflow.service';
import { SubmissionLifecycleService } from './submission-lifecycle.service';
import { SubmissionAiService } from './submission-ai.service';

/** Resolve slug lookups via {@link SubmissionAccessService.getBySlugOrThrow}. */
export function mockSubmissionsRepoFindBySlug(
  submissionsRepo: { findOne?: jest.Mock },
  resolver: (slug: string) => Submission | Promise<Submission | null> | null,
): jest.Mock {
  submissionsRepo.findOne = jest.fn(
    async (opts: { where: { slug: string } }) => {
      const result = await resolver(opts.where.slug);
      return result ?? null;
    },
  );
  return submissionsRepo.findOne;
}

export function getSubmissionTestServices(moduleRef: TestingModule) {
  return {
    service: moduleRef.get(SubmissionsService),
    access: moduleRef.get(SubmissionAccessService),
    files: moduleRef.get(SubmissionFileService),
    events: moduleRef.get(SubmissionEventsService),
    reviewWorkflow: moduleRef.get(ReviewWorkflowService),
    copyeditWorkflow: moduleRef.get(CopyeditWorkflowService),
    lifecycle: moduleRef.get(SubmissionLifecycleService),
    ai: moduleRef.get(SubmissionAiService),
  };
}

export type SubmissionsRepoMocks = {
  submissionsRepo?: Record<string, unknown>;
  filesRepo?: Record<string, unknown>;
  assignmentsRepo?: Record<string, unknown>;
  reviewsRepo?: Record<string, unknown>;
  copyeditAssignmentsRepo?: Record<string, unknown>;
  copyeditNotesRepo?: Record<string, unknown>;
  usersRepo?: Record<string, unknown>;
  rbacService?: Record<string, unknown>;
  eventPublisher?: Record<string, unknown>;
  configService?: { get: jest.Mock };
  docxGenerator?: Record<string, unknown>;
  manuscriptStyles?: Record<string, unknown>;
};

/** Nest providers for unit tests that construct {@link SubmissionsService}. */
export function submissionsServiceTestProviders(
  mocks: SubmissionsRepoMocks = {},
): Provider[] {
  return [
    SubmissionsService,
    SubmissionAccessService,
    PublicationCatalogService,
    SubmissionFileService,
    SubmissionEventsService,
    ReviewWorkflowService,
    CopyeditWorkflowService,
    SubmissionLifecycleService,
    SubmissionAiService,
    {
      provide: getRepositoryToken(Submission),
      useValue: mocks.submissionsRepo ?? {},
    },
    {
      provide: getRepositoryToken(SubmissionFile),
      useValue: mocks.filesRepo ?? {},
    },
    {
      provide: getRepositoryToken(ReviewAssignment),
      useValue: mocks.assignmentsRepo ?? {},
    },
    { provide: getRepositoryToken(Review), useValue: mocks.reviewsRepo ?? {} },
    {
      provide: getRepositoryToken(CopyeditAssignment),
      useValue: mocks.copyeditAssignmentsRepo ?? {},
    },
    {
      provide: getRepositoryToken(CopyeditNote),
      useValue: mocks.copyeditNotesRepo ?? {},
    },
    { provide: getRepositoryToken(User), useValue: mocks.usersRepo ?? {} },
    { provide: RbacService, useValue: mocks.rbacService ?? {} },
    { provide: DocxGeneratorService, useValue: mocks.docxGenerator ?? {} },
    {
      provide: ManuscriptStyleRegistryService,
      useValue: mocks.manuscriptStyles ?? {
        assertConstructorContentStyleKnown: jest.fn(),
        resolveEffectiveStyleId: jest
          .fn()
          .mockReturnValue('damascus-university-journal-v1'),
        getProfile: jest.fn(),
      },
    },
    {
      provide: EventPublisherService,
      useValue: mocks.eventPublisher ?? {
        enqueue: jest.fn(),
        enqueueMany: jest.fn(),
      },
    },
    notificationsServiceMock,
    {
      provide: ConfigService,
      useValue: mocks.configService ?? {
        get: jest.fn((key: string, def?: string) => {
          if (key === 'APP_BASE_URL') return 'http://localhost:5240';
          if (key === 'DEFAULT_EMAIL_LOCALE') return 'en';
          return def;
        }),
      },
    },
    aiClientServiceMock,
    aiJobsServiceMock,
    languageToolServiceMock,
    { provide: SearchService, useValue: null },
  ];
}
