import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Journal } from '../entities/journal.entity';
import { JournalDirectoryService } from './journal-directory.service';

const ENGJ = {
  id: 'journal-engj',
  slug: 'engj',
  titleAr: 'مجلة جامعة دمشق للعلوم الهندسية',
  titleEn: 'Damascus University Journal for Engineering Sciences',
  disciplineLabel: 'العلوم الهندسية',
  isActive: true,
} as Journal;

const RETIRED = {
  ...ENGJ,
  id: 'journal-retired',
  slug: 'oldj',
  isActive: false,
} as Journal;

describe('JournalDirectoryService', () => {
  let service: JournalDirectoryService;
  let journalsRepo: { find: jest.Mock; findOne: jest.Mock };

  beforeEach(async () => {
    journalsRepo = {
      find: jest.fn().mockResolvedValue([ENGJ]),
      findOne: jest.fn().mockResolvedValue(ENGJ),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        JournalDirectoryService,
        { provide: getRepositoryToken(Journal), useValue: journalsRepo },
      ],
    }).compile();
    service = moduleRef.get(JournalDirectoryService);
  });

  describe('listOptions', () => {
    it('offers only journals still accepting submissions, in catalog order', async () => {
      await service.listOptions();

      expect(journalsRepo.find).toHaveBeenCalledWith({
        where: { isActive: true },
        order: { sortOrder: 'ASC' },
      });
    });

    it('returns identity and titles but never the internal row', async () => {
      const [option] = await service.listOptions();

      expect(option).toEqual({
        id: 'journal-engj',
        slug: 'engj',
        titleAr: ENGJ.titleAr,
        titleEn: ENGJ.titleEn,
        disciplineLabel: 'العلوم الهندسية',
      });
    });
  });

  describe('assertSubmittableJournal', () => {
    it('accepts an active journal', async () => {
      await expect(
        service.assertSubmittableJournal('journal-engj'),
      ).resolves.toBe(ENGJ);
    });

    it('rejects a journal id that does not exist', async () => {
      journalsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.assertSubmittableJournal('journal-gone'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    // A retired journal keeps its archive but must not receive new manuscripts.
    it('rejects a retired journal', async () => {
      journalsRepo.findOne.mockResolvedValue(RETIRED);

      await expect(
        service.assertSubmittableJournal('journal-retired'),
      ).rejects.toMatchObject({
        response: { code: 'JOURNAL_NOT_AVAILABLE' },
      });
    });
  });
});
