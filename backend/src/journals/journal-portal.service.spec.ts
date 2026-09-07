import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Journal } from '../entities/journal.entity';
import { JournalIssue } from '../entities/journal-issue.entity';
import { JournalIssueStatus } from '../entities/journal-issue-status.enum';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { JournalPortalService } from './journal-portal.service';

const ENGJ = {
  id: 'j-engj',
  slug: 'engj',
  titleAr: 'مجلة جامعة دمشق للعلوم الهندسية',
  titleEn: 'Damascus University Journal for Engineering Sciences',
  disciplineLabel: 'العلوم الهندسية',
  issn: null,
  eissn: null,
  descriptionAr: null,
  descriptionEn: null,
  isActive: true,
  sortOrder: 9,
} as Journal;

const ISSUE_2026_1 = {
  id: 'i-2026-1',
  journalId: 'j-engj',
  year: 2026,
  number: 1,
  volume: null,
  titleAr: null,
  titleEn: null,
  status: JournalIssueStatus.PUBLISHED,
  publishedAt: new Date('2026-03-01'),
} as JournalIssue;

describe('JournalPortalService', () => {
  let service: JournalPortalService;
  let journalsRepo: { find: jest.Mock; findOne: jest.Mock };
  let issuesRepo: { find: jest.Mock; findOne: jest.Mock };
  let submissionsRepo: { find: jest.Mock; createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    journalsRepo = {
      find: jest.fn().mockResolvedValue([ENGJ]),
      findOne: jest.fn().mockResolvedValue(ENGJ),
    };
    issuesRepo = {
      find: jest.fn().mockResolvedValue([ISSUE_2026_1]),
      findOne: jest.fn().mockResolvedValue(ISSUE_2026_1),
    };
    submissionsRepo = {
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      })),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        JournalPortalService,
        { provide: getRepositoryToken(Journal), useValue: journalsRepo },
        { provide: getRepositoryToken(JournalIssue), useValue: issuesRepo },
        { provide: getRepositoryToken(Submission), useValue: submissionsRepo },
      ],
    }).compile();
    service = moduleRef.get(JournalPortalService);
  });

  it('lists only active journals, in catalog order', async () => {
    await service.listJournals();

    expect(journalsRepo.find).toHaveBeenCalledWith({
      where: { isActive: true },
      order: { sortOrder: 'ASC' },
    });
  });

  it('exposes both citations for a journal issue', async () => {
    const { issues } = await service.getJournalBySlug('engj');

    expect(issues[0].citationAr).toBe('العدد 1، 2026');
    expect(issues[0].citationEn).toBe('No. 1 (2026)');
  });

  it('shows only published issues on a journal page', async () => {
    await service.getJournalBySlug('engj');

    expect(issuesRepo.find).toHaveBeenCalledWith({
      where: { journalId: 'j-engj', status: JournalIssueStatus.PUBLISHED },
      order: { year: 'DESC', number: 'DESC' },
    });
  });

  it('404s for an unknown journal slug', async () => {
    journalsRepo.findOne.mockResolvedValue(null);

    await expect(service.getJournalBySlug('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404s for an issue that is not published yet', async () => {
    issuesRepo.findOne.mockResolvedValue(null);

    await expect(service.getIssue('engj', 2026, 2)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lists only published articles in an issue, so a retraction disappears', async () => {
    await service.getIssue('engj', 2026, 1);

    expect(submissionsRepo.find).toHaveBeenCalledWith({
      where: { issueId: 'i-2026-1', status: SubmissionStatus.PUBLISHED },
      relations: ['author'],
      order: { publishedAt: 'ASC' },
    });
  });

  it('addresses an issue by year and number, per the public URL contract', async () => {
    await service.getIssue('engj', 2026, 1);

    expect(issuesRepo.findOne).toHaveBeenCalledWith({
      where: {
        journalId: 'j-engj',
        year: 2026,
        number: 1,
        status: JournalIssueStatus.PUBLISHED,
      },
    });
  });
});
