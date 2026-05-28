import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { SubmissionsService } from './submissions.service';
import { aiClientServiceMock } from '../ai/ai-client.service.mock';
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
import type { RequestUser } from '../common/types/request-user';
import type { ConstructorContent } from './constructor-content.types';

const minimalDocxZip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);

describe('SubmissionsService.generateDocx (attach)', () => {
  let service: SubmissionsService;
  let uploadDir: string;
  let submissionsRepo: { findOne: jest.Mock };
  let filesRepo: {
    find: jest.Mock;
    remove: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let docxGenerate: jest.Mock;

  const authorUser: RequestUser = {
    sub: 'author-1',
    email: 'a@test.dev',
    roleSlugs: ['author'],
    permissionSlugs: [],
  };

  const draftSubmission: Submission = {
    id: 'sub-1',
    slug: 'test',
    authorId: authorUser.sub,
    status: SubmissionStatus.DRAFT,
  } as Submission;

  const minimalContent: ConstructorContent = {
    defaultDir: 'ltr',
    sections: [],
  };

  beforeEach(async () => {
    const relUpload = join('.test-uploads', randomUUID());
    uploadDir = join(process.cwd(), relUpload);
    await mkdir(uploadDir, { recursive: true });
    process.env.UPLOAD_DIR = relUpload;

    docxGenerate = jest.fn().mockResolvedValue(minimalDocxZip);

    submissionsRepo = {
      findOne: jest.fn().mockResolvedValue(draftSubmission),
    };

    filesRepo = {
      find: jest.fn().mockResolvedValue([]),
      remove: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((row: Partial<SubmissionFile>) => row),
      save: jest.fn(async (row: Partial<SubmissionFile>) => ({
        ...row,
        id: 'file-new',
      })),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SubmissionsService,
        { provide: getRepositoryToken(Submission), useValue: submissionsRepo },
        { provide: getRepositoryToken(SubmissionFile), useValue: filesRepo },
        { provide: getRepositoryToken(ReviewAssignment), useValue: {} },
        { provide: getRepositoryToken(Review), useValue: {} },
        { provide: getRepositoryToken(CopyeditAssignment), useValue: {} },
        { provide: getRepositoryToken(CopyeditNote), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: RbacService, useValue: {} },
        {
          provide: DocxGeneratorService,
          useValue: { generate: docxGenerate },
        },
        {
          provide: ManuscriptStyleRegistryService,
          useValue: {
            resolveEffectiveStyleId: jest
              .fn()
              .mockReturnValue('damascus-university-journal-v1'),
            getProfile: jest.fn().mockReturnValue({ constructor: {} }),
          },
        },
        { provide: EventPublisherService, useValue: { enqueue: jest.fn() } },
        notificationsServiceMock,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((_k: string, def?: string) => def) },
        },
        aiClientServiceMock,
      ],
    }).compile();

    service = moduleRef.get(SubmissionsService);
  });

  afterEach(async () => {
    delete process.env.UPLOAD_DIR;
    await rm(uploadDir, { recursive: true, force: true });
  });

  it('persists generated docx from buffer when attach=true', async () => {
    const result = await service.generateDocx(
      draftSubmission.slug!,
      authorUser,
      minimalContent,
      { attach: true, attachKind: 'manuscript' },
    );

    expect(result.kind).toBe('attached');
    if (result.kind !== 'attached') return;

    expect(filesRepo.remove).not.toHaveBeenCalled();
    expect(filesRepo.save).toHaveBeenCalledTimes(1);
    const saved = filesRepo.save.mock.calls[0][0] as SubmissionFile;
    expect(saved.kind).toBe('manuscript');
    expect(saved.originalName).toBe('test-constructor.docx');
    expect(saved.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );

    const diskPath = join(uploadDir, saved.storageKey);
    expect(existsSync(diskPath)).toBe(true);
    const onDisk = await readFile(diskPath);
    expect(onDisk.equals(minimalDocxZip)).toBe(true);
  });

  it('replaces existing files of the same kind before attach', async () => {
    const oldKey = 'old-key.docx';
    await writeFile(join(uploadDir, oldKey), Buffer.from('old'));
    filesRepo.find.mockResolvedValue([
      {
        id: 'old-file',
        submissionId: draftSubmission.id,
        kind: 'manuscript_constructor',
        storageKey: oldKey,
      },
    ]);

    await service.generateDocx(draftSubmission.slug!, authorUser, minimalContent, {
      attach: true,
      attachKind: 'manuscript_constructor',
    });

    expect(filesRepo.remove).toHaveBeenCalled();
    expect(existsSync(join(uploadDir, oldKey))).toBe(false);
  });
});
