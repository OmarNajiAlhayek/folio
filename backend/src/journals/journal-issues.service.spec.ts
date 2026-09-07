import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In } from 'typeorm';
import { JournalIssue } from '../entities/journal-issue.entity';
import { JournalIssueStatus } from '../entities/journal-issue-status.enum';
import { JournalIssuesService } from './journal-issues.service';

const issue = (over: Partial<JournalIssue> = {}): JournalIssue =>
  ({
    id: 'issue-1',
    journalId: 'journal-medj',
    year: 2026,
    number: 1,
    volume: null,
    titleAr: null,
    titleEn: null,
    status: JournalIssueStatus.OPEN,
    ...over,
  }) as JournalIssue;

describe('JournalIssuesService', () => {
  let service: JournalIssuesService;
  let issuesRepo: { find: jest.Mock; findOne: jest.Mock };

  beforeEach(async () => {
    issuesRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        JournalIssuesService,
        { provide: getRepositoryToken(JournalIssue), useValue: issuesRepo },
      ],
    }).compile();
    service = moduleRef.get(JournalIssuesService);
  });

  it('renders the Arabic and English citations for each issue', async () => {
    issuesRepo.find.mockResolvedValue([issue({ year: 2026, number: 3 })]);

    const [row] = await service.listPublishableIssues('journal-medj');

    expect(row.citationAr).toBe('العدد 3، 2026');
    expect(row.citationEn).toBe('No. 3 (2026)');
  });

  it('surfaces المجلد in the staff label only when the issue has one', async () => {
    issuesRepo.find.mockResolvedValue([
      issue({ year: 2026, number: 3, volume: 12 }),
    ]);

    const [row] = await service.listPublishableIssues('journal-medj');

    expect(row.labelAr).toBe('المجلد 12، العدد 3، 2026');
  });

  it('lists only issues that accept articles, newest first', async () => {
    await service.listPublishableIssues('journal-medj');

    // Compared against a real `In(...)`, so silently widening the status set
    // fails here rather than only showing up in the portal.
    expect(issuesRepo.find).toHaveBeenCalledWith({
      where: {
        journalId: 'journal-medj',
        status: In([JournalIssueStatus.OPEN, JournalIssueStatus.PUBLISHED]),
      },
      order: { year: 'DESC', number: 'DESC' },
    });
  });

  it('accepts an open issue of the submission’s journal', async () => {
    issuesRepo.findOne.mockResolvedValue(issue());

    await expect(
      service.getIssueAcceptingArticleOrThrow('journal-medj', 'issue-1'),
    ).resolves.toMatchObject({ id: 'issue-1' });
  });

  it('accepts a published issue, which still gains rolling additions', async () => {
    issuesRepo.findOne.mockResolvedValue(
      issue({ status: JournalIssueStatus.PUBLISHED }),
    );

    await expect(
      service.getIssueAcceptingArticleOrThrow('journal-medj', 'issue-1'),
    ).resolves.toMatchObject({ id: 'issue-1' });
  });

  it('rejects an issue belonging to another journal', async () => {
    issuesRepo.findOne.mockResolvedValue(issue({ journalId: 'journal-engj' }));

    await expect(
      service.getIssueAcceptingArticleOrThrow('journal-medj', 'issue-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([JournalIssueStatus.PLANNED, JournalIssueStatus.CLOSED])(
    'rejects a %s issue',
    async (status) => {
      issuesRepo.findOne.mockResolvedValue(issue({ status }));

      await expect(
        service.getIssueAcceptingArticleOrThrow('journal-medj', 'issue-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('rejects an issue that does not exist', async () => {
    issuesRepo.findOne.mockResolvedValue(null);

    await expect(
      service.getIssueAcceptingArticleOrThrow('journal-medj', 'nope'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
