import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { RequestUser } from '../common/types/request-user';
import { Journal } from '../entities/journal.entity';
import { PERMISSION_SLUGS, ROLE_SLUGS } from '../rbac/permission-slugs';
import { JournalMembershipService } from './journal-membership.service';
import { JournalMetadataService } from './journal-metadata.service';

const MANAGER: RequestUser = {
  sub: 'jm-1',
  email: 'jm@example.test',
  roleSlugs: [ROLE_SLUGS.JOURNAL_MANAGER],
  permissionSlugs: [
    PERMISSION_SLUGS.JOURNAL_EDIT_METADATA,
    PERMISSION_SLUGS.JOURNAL_EDIT_TITLES,
  ],
};

const EDITOR: RequestUser = {
  sub: 'ed-1',
  email: 'ed@example.test',
  roleSlugs: [ROLE_SLUGS.EDITOR],
  permissionSlugs: [PERMISSION_SLUGS.JOURNAL_EDIT_METADATA],
};

function medj(): Journal {
  return {
    id: 'journal-medj',
    slug: 'medj',
    titleAr: 'مجلة جامعة دمشق للعلوم الطبية',
    titleEn: 'Damascus University Journal for Medical Sciences',
    disciplineLabel: 'العلوم الطبية',
    issn: '2072-2265',
    eissn: '2789-6889',
    descriptionAr: null,
    descriptionEn: null,
    isActive: true,
    sortOrder: 7,
    updatedAt: new Date('2026-09-12T00:00:00.000Z'),
  } as Journal;
}

describe('JournalMetadataService', () => {
  let service: JournalMetadataService;
  let journal: Journal;
  let journalsRepo: { find: jest.Mock; findOne: jest.Mock; save: jest.Mock };
  let listJournalIdsForUser: jest.Mock;

  beforeEach(async () => {
    journal = medj();
    journalsRepo = {
      find: jest.fn().mockResolvedValue([journal]),
      // A slug lookup finds the journal; the ISSN clash lookup (an OR array)
      // finds nothing unless a test says otherwise.
      findOne: jest.fn(({ where }: { where: unknown }) =>
        Promise.resolve(Array.isArray(where) ? null : journal),
      ),
      save: jest.fn((row: Journal) => Promise.resolve(row)),
    };
    listJournalIdsForUser = jest.fn().mockResolvedValue(['journal-medj']);

    const moduleRef = await Test.createTestingModule({
      providers: [
        JournalMetadataService,
        { provide: getRepositoryToken(Journal), useValue: journalsRepo },
        {
          provide: JournalMembershipService,
          useValue: { listJournalIdsForUser },
        },
      ],
    }).compile();

    service = moduleRef.get(JournalMetadataService);
  });

  describe('listEditable', () => {
    it('gives the journal manager every journal, titles included', async () => {
      const rows = await service.listEditable(MANAGER);

      expect(rows).toEqual([
        expect.objectContaining({ slug: 'medj', canEditTitles: true }),
      ]);
      expect(journalsRepo.find).toHaveBeenCalledWith({
        order: { sortOrder: 'ASC' },
      });
      expect(listJournalIdsForUser).not.toHaveBeenCalled();
    });

    it('gives an editor only the journals they are editor-in-chief of', async () => {
      const rows = await service.listEditable(EDITOR);

      expect(listJournalIdsForUser).toHaveBeenCalledWith(
        'ed-1',
        ROLE_SLUGS.EDITOR,
      );
      expect(rows).toEqual([
        expect.objectContaining({ slug: 'medj', canEditTitles: false }),
      ]);
    });

    it('gives an editor with no membership nothing, without reading journals', async () => {
      listJournalIdsForUser.mockResolvedValue([]);

      await expect(service.listEditable(EDITOR)).resolves.toEqual([]);
      expect(journalsRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it("lets an editor-in-chief set their journal's ISSNs and aims and scope", async () => {
      const saved = await service.update(EDITOR, 'medj', {
        issn: '20722265',
        eissn: null,
        descriptionAr: '  نشر البحوث الطبية المحكّمة  ',
        descriptionEn: '',
      });

      expect(saved).toMatchObject({
        issn: '2072-2265',
        eissn: null,
        descriptionAr: 'نشر البحوث الطبية المحكّمة',
        descriptionEn: null,
      });
      expect(journalsRepo.save).toHaveBeenCalledTimes(1);
    });

    it('refuses an editor outside their own journals', async () => {
      listJournalIdsForUser.mockResolvedValue(['journal-engj']);

      await expect(
        service.update(EDITOR, 'medj', { eissn: null }),
      ).rejects.toMatchObject({ response: { code: 'JOURNAL_OUT_OF_SCOPE' } });
      expect(journalsRepo.save).not.toHaveBeenCalled();
    });

    it('keeps title changes with the journal manager', async () => {
      await expect(
        service.update(EDITOR, 'medj', {
          titleAr: 'مجلة جامعة دمشق للعلوم الطبية والصحية',
        }),
      ).rejects.toMatchObject({
        response: { code: 'JOURNAL_TITLES_FORBIDDEN' },
      });
    });

    it('does not count an unchanged title sent by an editor as an edit', async () => {
      const { titleAr, titleEn } = journal;

      await expect(
        service.update(EDITOR, 'medj', {
          titleAr,
          titleEn: `${titleEn} `,
          descriptionEn: 'Peer-reviewed medical research.',
        }),
      ).resolves.toMatchObject({
        titleEn,
        descriptionEn: 'Peer-reviewed medical research.',
      });
    });

    it('lets the journal manager rename a journal', async () => {
      const saved = await service.update(MANAGER, 'medj', {
        titleAr: 'مجلة جامعة دمشق للعلوم الطبية والصحية',
      });

      expect(saved.titleAr).toBe('مجلة جامعة دمشق للعلوم الطبية والصحية');
    });

    it('refuses to blank a title', async () => {
      await expect(
        service.update(MANAGER, 'medj', { titleEn: '   ' }),
      ).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    });

    it('refuses an ISSN with a wrong check digit', async () => {
      await expect(
        service.update(EDITOR, 'medj', { issn: '2072-2266' }),
      ).rejects.toMatchObject({
        response: { code: 'INVALID_ISSN', field: 'issn' },
      });
    });

    it('refuses one number for both the print and the electronic edition', async () => {
      await expect(
        service.update(EDITOR, 'medj', { eissn: '2072-2265' }),
      ).rejects.toMatchObject({ response: { code: 'ISSN_DUPLICATE' } });
    });

    it('refuses an ISSN that already names another journal', async () => {
      journalsRepo.findOne.mockImplementation(({ where }: { where: unknown }) =>
        Promise.resolve(
          Array.isArray(where) ? { id: 'journal-engj', slug: 'engj' } : journal,
        ),
      );

      await expect(
        service.update(EDITOR, 'medj', { eissn: '2789-6854' }),
      ).rejects.toMatchObject({ response: { code: 'ISSN_IN_USE' } });
    });

    it('answers not found for an unknown journal', async () => {
      journalsRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.update(MANAGER, 'nope', {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('writes nothing when nothing was sent', async () => {
      await service.update(EDITOR, 'medj', {});

      expect(journalsRepo.save).not.toHaveBeenCalled();
    });
  });
});
