import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SubmissionStatus } from '../entities/submission-status.enum';
import type { RequestUser } from '../common/types/request-user';
import { JournalDirectoryService } from '../journals/journal-directory.service';
import {
  getSubmissionTestServices,
  mockSubmissionsRepoFindBySlug,
  submissionsServiceTestProviders,
} from './submissions-service.testing';
import type { SubmissionLifecycleService } from './submission-lifecycle.service';
import type { Submission } from '../entities/submission.entity';

/**
 * Slice 6: an author picks a journal at submission and `submissions.journal_id`
 * is NOT NULL. These are the rules that keep that column trustworthy.
 */
describe('SubmissionLifecycleService journal selection', () => {
  let lifecycle: SubmissionLifecycleService;
  let submissionsRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    count: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let assertSubmittableJournal: jest.Mock;

  const author = 'author-1';
  const authorUser: RequestUser = {
    sub: author,
    email: 'author@folio.dev',
    roleSlugs: ['author'],
    permissionSlugs: [],
  };

  const baseDto = {
    journalId: '11111111-1111-4111-8111-111111111111',
    title: 'Energy-aware scheduling',
    abstract: 'An abstract long enough to pass the word-count guard.',
  };

  beforeEach(async () => {
    // Slug availability runs through a query builder; no row means "free".
    const slugQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    submissionsRepo = {
      create: jest.fn((row: unknown) => row),
      save: jest.fn((row: unknown) => Promise.resolve(row)),
      findOne: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest.fn(() => slugQb),
    };
    assertSubmittableJournal = jest.fn().mockResolvedValue({});

    const moduleRef = await Test.createTestingModule({
      providers: submissionsServiceTestProviders({
        submissionsRepo,
        journalDirectoryService: {
          listOptions: jest.fn().mockResolvedValue([]),
          assertSubmittableJournal,
        },
      }),
    }).compile();

    lifecycle = getSubmissionTestServices(moduleRef).lifecycle;
    // Keep the module's own instance and the spec's double in sync.
    expect(moduleRef.get(JournalDirectoryService)).toBeDefined();
  });

  describe('create', () => {
    it('persists the journal the author chose', async () => {
      const saved = (await lifecycle.create(author, {
        ...baseDto,
      })) as unknown as Submission;

      expect(saved.journalId).toBe(baseDto.journalId);
    });

    it('validates the journal before inserting, so a bad id is a 400 not an FK error', async () => {
      assertSubmittableJournal.mockRejectedValue(
        new BadRequestException({ code: 'JOURNAL_NOT_AVAILABLE' }),
      );

      await expect(
        lifecycle.create(author, { ...baseDto }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(submissionsRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    function draft(): Submission {
      return {
        id: 'sub-1',
        slug: 'energy-aware-scheduling',
        authorId: author,
        status: SubmissionStatus.DRAFT,
        journalId: baseDto.journalId,
        title: baseDto.title,
        titleAr: '',
        abstract: baseDto.abstract,
        abstractAr: '',
      } as Submission;
    }

    it('moves an editable draft to another journal', async () => {
      const row = draft();
      mockSubmissionsRepoFindBySlug(submissionsRepo, () => row);
      const nextJournal = '22222222-2222-4222-8222-222222222222';

      await lifecycle.update(row.slug!, authorUser, { journalId: nextJournal });

      expect(assertSubmittableJournal).toHaveBeenCalledWith(nextJournal);
      expect(row.journalId).toBe(nextJournal);
    });

    it('does not re-validate when the journal is unchanged', async () => {
      const row = draft();
      mockSubmissionsRepoFindBySlug(submissionsRepo, () => row);

      await lifecycle.update(row.slug!, authorUser, {
        journalId: baseDto.journalId,
      });

      expect(assertSubmittableJournal).not.toHaveBeenCalled();
    });

    // The status guard is what stops a published article drifting away from
    // the issue it was filed into.
    it('refuses to move a submission that is past the editable stages', async () => {
      const row = draft();
      row.status = SubmissionStatus.UNDER_REVIEW;
      mockSubmissionsRepoFindBySlug(submissionsRepo, () => row);

      await expect(
        lifecycle.update(row.slug!, authorUser, {
          journalId: '22222222-2222-4222-8222-222222222222',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(assertSubmittableJournal).not.toHaveBeenCalled();
    });
  });
});
