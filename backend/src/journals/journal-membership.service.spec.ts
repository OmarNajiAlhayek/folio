import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Journal } from '../entities/journal.entity';
import { JournalMembership } from '../entities/journal-membership.entity';
import { ROLE_SLUGS } from '../rbac/permission-slugs';
import { JournalMembershipService } from './journal-membership.service';

const MEDJ = {
  id: 'journal-medj',
  disciplineLabel: 'العلوم الطبية',
} as Journal;
const ENGJ = {
  id: 'journal-engj',
  disciplineLabel: 'العلوم الهندسية',
} as Journal;

describe('JournalMembershipService', () => {
  let service: JournalMembershipService;
  let membershipsRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  let journalsRepo: { find: jest.Mock; findOne: jest.Mock };

  beforeEach(async () => {
    membershipsRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
      save: jest.fn((rows: unknown) => Promise.resolve(rows)),
      create: jest.fn((row: unknown) => row),
    };
    journalsRepo = {
      find: jest.fn().mockResolvedValue([MEDJ, ENGJ]),
      findOne: jest.fn().mockResolvedValue(MEDJ),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        JournalMembershipService,
        {
          provide: getRepositoryToken(JournalMembership),
          useValue: membershipsRepo,
        },
        { provide: getRepositoryToken(Journal), useValue: journalsRepo },
      ],
    }).compile();

    service = moduleRef.get(JournalMembershipService);
  });

  it('lists journal ids for one user and role', async () => {
    membershipsRepo.find.mockResolvedValue([
      { journalId: 'journal-medj' },
      { journalId: 'journal-engj' },
    ]);

    const ids = await service.listJournalIdsForUser('u-1', ROLE_SLUGS.EDITOR);

    expect(ids).toEqual(['journal-medj', 'journal-engj']);
    expect(membershipsRepo.find).toHaveBeenCalledWith({
      where: { userId: 'u-1', roleSlug: ROLE_SLUGS.EDITOR },
      select: ['journalId'],
    });
  });

  it('filters a candidate set to the members of one journal', async () => {
    membershipsRepo.find.mockResolvedValue([{ userId: 'se-2' }]);

    const ids = await service.filterUserIdsInJournal(
      ['se-1', 'se-2'],
      'journal-medj',
      ROLE_SLUGS.SECTION_EDITOR,
    );

    expect(ids).toEqual(['se-2']);
  });

  it('short-circuits an empty candidate set without querying', async () => {
    const ids = await service.filterUserIdsInJournal(
      [],
      'journal-medj',
      ROLE_SLUGS.SECTION_EDITOR,
    );

    expect(ids).toEqual([]);
    expect(membershipsRepo.find).not.toHaveBeenCalled();
  });

  it('translates memberships back to discipline labels per user', async () => {
    membershipsRepo.find.mockResolvedValue([
      { userId: 'se-1', journalId: 'journal-medj' },
      { userId: 'se-1', journalId: 'journal-engj' },
      { userId: 'se-2', journalId: 'journal-engj' },
    ]);

    const map = await service.disciplineLabelsByUser(
      ['se-1', 'se-2'],
      ROLE_SLUGS.SECTION_EDITOR,
    );

    expect(map.get('se-1')).toEqual(['العلوم الطبية', 'العلوم الهندسية']);
    expect(map.get('se-2')).toEqual(['العلوم الهندسية']);
  });

  it('drops a membership whose journal row is missing', async () => {
    membershipsRepo.find.mockResolvedValue([
      { userId: 'se-1', journalId: 'journal-deleted' },
    ]);

    const map = await service.disciplineLabelsByUser(
      ['se-1'],
      ROLE_SLUGS.SECTION_EDITOR,
    );

    expect(map.get('se-1')).toBeUndefined();
  });

  it('replaces a user scope with the journals matching the labels', async () => {
    const stored = await service.setDisciplineLabelsForUser(
      'se-1',
      ROLE_SLUGS.SECTION_EDITOR,
      ['العلوم الهندسية'],
    );

    expect(membershipsRepo.delete).toHaveBeenCalledWith({
      userId: 'se-1',
      roleSlug: ROLE_SLUGS.SECTION_EDITOR,
    });
    expect(membershipsRepo.save).toHaveBeenCalledWith([
      {
        userId: 'se-1',
        journalId: 'journal-engj',
        roleSlug: ROLE_SLUGS.SECTION_EDITOR,
      },
    ]);
    expect(stored).toEqual(['العلوم الهندسية']);
  });

  it('drops an unknown label instead of storing it', async () => {
    const stored = await service.setDisciplineLabelsForUser(
      'se-1',
      ROLE_SLUGS.SECTION_EDITOR,
      ['العلوم الهندسية', 'not-a-real-label'],
    );

    expect(stored).toEqual(['العلوم الهندسية']);
    expect(membershipsRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({ journalId: 'journal-engj' }),
    ]);
  });

  it('clears the scope when given no labels', async () => {
    const stored = await service.setDisciplineLabelsForUser(
      'se-1',
      ROLE_SLUGS.SECTION_EDITOR,
      [],
    );

    expect(stored).toEqual([]);
    expect(membershipsRepo.delete).toHaveBeenCalled();
    expect(membershipsRepo.save).not.toHaveBeenCalled();
  });
});
