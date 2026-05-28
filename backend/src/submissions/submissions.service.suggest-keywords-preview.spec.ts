import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubmissionsService } from './submissions.service';
import { AiClientService } from '../ai/ai-client.service';
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
import type { RequestUser } from '../common/types/request-user';

describe('SubmissionsService.suggestKeywordsPreview', () => {
  let service: SubmissionsService;
  let aiClient: {
    isKeywordsEnabled: jest.Mock;
    suggestKeywords: jest.Mock;
  };

  const author: RequestUser = {
    sub: 'author-1',
    email: 'a@test.dev',
    roleSlugs: ['author'],
    permissionSlugs: [],
  };

  beforeEach(async () => {
    aiClient = {
      isKeywordsEnabled: jest.fn().mockReturnValue(true),
      suggestKeywords: jest.fn().mockResolvedValue({
        status: 'ok',
        data: {
          keywords_en: ['Neural Networks'],
          keywords_ar: ['شبكات عصبية'],
        },
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SubmissionsService,
        { provide: getRepositoryToken(Submission), useValue: {} },
        { provide: getRepositoryToken(SubmissionFile), useValue: {} },
        { provide: getRepositoryToken(ReviewAssignment), useValue: {} },
        { provide: getRepositoryToken(Review), useValue: {} },
        { provide: getRepositoryToken(CopyeditAssignment), useValue: {} },
        { provide: getRepositoryToken(CopyeditNote), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: AiClientService, useValue: aiClient },
        { provide: RbacService, useValue: {} },
        { provide: DocxGeneratorService, useValue: {} },
        { provide: ManuscriptStyleRegistryService, useValue: {} },
        { provide: EventPublisherService, useValue: { enqueue: jest.fn() } },
        notificationsServiceMock,
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();

    service = moduleRef.get(SubmissionsService);
  });

  it('suggests from request body without a submission slug', async () => {
    const result = await service.suggestKeywordsPreview(author, {
      title: 'English title',
      abstract: 'English abstract text.',
      titleAr: 'عنوان',
      abstractAr: 'ملخص عربي.',
    });
    expect(result.keywordsEn).toEqual(['Neural Networks']);
    expect(result.keywordsAr).toEqual(['شبكات عصبية']);
    expect(aiClient.suggestKeywords).toHaveBeenCalledWith({
      title: 'English title',
      abstract: 'English abstract text.',
      titleAr: 'عنوان',
      abstractAr: 'ملخص عربي.',
    });
  });

  it('requires title and abstract for at least one language', async () => {
    await expect(
      service.suggestKeywordsPreview(author, { title: 'Only title' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
