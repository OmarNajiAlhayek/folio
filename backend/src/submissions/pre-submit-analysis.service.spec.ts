import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PreSubmitAnalysisService } from './pre-submit-analysis.service';
import { ManuscriptAnalysisService } from './manuscript-analysis.service';
import { SubmissionAccessService } from './submission-access.service';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import type { RequestUser } from '../common/types/request-user';
import type { ConstructorContent } from './constructor-content.types';
import { hashConstructorContent } from './constructor-content-hash.util';

describe('PreSubmitAnalysisService', () => {
  let service: PreSubmitAnalysisService;
  let submissionsRepo: { save: jest.Mock };
  let access: { getBySlugOrThrow: jest.Mock };
  let analysis: { analyzeContent: jest.Mock };

  const author: RequestUser = {
    sub: 'author-1',
    email: 'author@test.dev',
    roleSlugs: ['author'],
    permissionSlugs: [],
  };

  const constructorContent: ConstructorContent = {
    defaultDir: 'ltr',
    sections: [
      {
        id: 't1',
        kind: 'title',
        text: 'Title',
        dir: 'ltr',
        dirSource: 'manual',
      },
    ],
  };

  function draftSubmission(overrides: Partial<Submission> = {}): Submission {
    return {
      id: 'sub-1',
      slug: 'paper-one',
      authorId: author.sub,
      status: SubmissionStatus.DRAFT,
      constructorContent,
      disciplines: [],
      preSubmitAnalysis: null,
      ...overrides,
    } as Submission;
  }

  beforeEach(async () => {
    submissionsRepo = { save: jest.fn((row: Submission) => row) };
    access = {
      getBySlugOrThrow: jest.fn(() => draftSubmission()),
    };
    analysis = {
      analyzeContent: jest.fn().mockResolvedValue({
        formatIssues: [],
        grammarNotes: [],
        referenceIssues: [],
        aiUnavailable: false,
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PreSubmitAnalysisService,
        { provide: getRepositoryToken(Submission), useValue: submissionsRepo },
        { provide: SubmissionAccessService, useValue: access },
        { provide: ManuscriptAnalysisService, useValue: analysis },
      ],
    }).compile();

    service = moduleRef.get(PreSubmitAnalysisService);
  });

  it('stores analysis with content hash on runAnalysis', async () => {
    const result = await service.runAnalysis('paper-one', author);
    expect(result.contentHash).toBe(hashConstructorContent(constructorContent));
    expect(submissionsRepo.save).toHaveBeenCalled();
    expect(result.acknowledged).toBe(true);
  });

  it('rejects non-authors', async () => {
    await expect(
      service.runAnalysis('paper-one', { ...author, sub: 'other-user' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires analysis before submit when constructor is presented', () => {
    expect(() =>
      service.assertReadyForPreSubmit(draftSubmission(), constructorContent, {
        presentUploaded: false,
        presentConstructor: true,
      }),
    ).toThrow(BadRequestException);
  });

  it('allows submit when analysis is fresh and acknowledged', () => {
    const contentHash = hashConstructorContent(constructorContent)!;
    expect(() =>
      service.assertReadyForPreSubmit(
        draftSubmission({
          preSubmitAnalysis: {
            id: 'a1',
            analyzedAt: new Date().toISOString(),
            contentHash,
            formatIssues: [],
            grammarNotes: [],
            referenceIssues: [],
            aiUnavailable: false,
            acknowledged: true,
            acknowledgedAt: new Date().toISOString(),
          },
        }),
        constructorContent,
        { presentUploaded: false, presentConstructor: true },
      ),
    ).not.toThrow();
  });

  it('allows submit when grammar notes exist but not acknowledged', () => {
    const contentHash = hashConstructorContent(constructorContent)!;
    expect(() =>
      service.assertReadyForPreSubmit(
        draftSubmission({
          preSubmitAnalysis: {
            id: 'a1',
            analyzedAt: new Date().toISOString(),
            contentHash,
            formatIssues: [],
            grammarNotes: [
              { excerpt: 'teh', suggestion: 'the', rule: 'SPELL' },
            ],
            referenceIssues: [],
            aiUnavailable: false,
            acknowledged: false,
            acknowledgedAt: null,
          },
        }),
        constructorContent,
        { presentUploaded: false, presentConstructor: true },
      ),
    ).not.toThrow();
  });

  it('skips gate for upload-only presentation', () => {
    expect(() =>
      service.assertReadyForPreSubmit(draftSubmission(), null, {
        presentUploaded: true,
        presentConstructor: false,
      }),
    ).not.toThrow();
  });
});
