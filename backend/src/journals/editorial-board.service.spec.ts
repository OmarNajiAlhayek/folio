import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { RequestUser } from '../common/types/request-user';
import { EditorialBoardMember } from '../entities/editorial-board-member.entity';
import { Journal } from '../entities/journal.entity';
import { PERMISSION_SLUGS, ROLE_SLUGS } from '../rbac/permission-slugs';
import { EditorialBoardService } from './editorial-board.service';
import { JournalMetadataService } from './journal-metadata.service';

const EDITOR: RequestUser = {
  sub: 'ed-1',
  email: 'ed@example.test',
  roleSlugs: [ROLE_SLUGS.EDITOR],
  permissionSlugs: [PERMISSION_SLUGS.JOURNAL_EDIT_METADATA],
};

const MEDJ = { id: 'journal-medj', slug: 'medj', isActive: true } as Journal;

function member(
  overrides: Partial<EditorialBoardMember> = {},
): EditorialBoardMember {
  return {
    id: 'm-1',
    journalId: 'journal-medj',
    nameAr: 'عضو تجريبي',
    nameEn: 'Sample Member',
    role: 'editor_in_chief',
    affiliationAr: 'جامعة دمشق',
    affiliationEn: 'Damascus University',
    orcid: '0000-0002-1825-0097',
    sortOrder: 0,
    ...overrides,
  } as EditorialBoardMember;
}

const VALID = {
  nameEn: 'New Member',
  role: 'member' as const,
  orcid: '0000-0000-0000-0028',
};

describe('EditorialBoardService', () => {
  let service: EditorialBoardService;
  let board: EditorialBoardMember[];
  let membersRepo: {
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };
  let journalsRepo: { findOne: jest.Mock };
  let findEditableJournal: jest.Mock;

  beforeEach(async () => {
    board = [
      member(),
      member({
        id: 'm-2',
        nameAr: null,
        nameEn: 'Second Member',
        role: 'member',
        orcid: '0000-0000-0000-001X',
        sortOrder: 1,
      }),
    ];
    membersRepo = {
      find: jest.fn(() => Promise.resolve(board)),
      create: jest.fn((row: object) => row),
      save: jest.fn((row: object) =>
        Promise.resolve(Array.isArray(row) ? row : { id: 'm-new', ...row }),
      ),
      remove: jest.fn((row: object) => Promise.resolve(row)),
    };
    journalsRepo = { findOne: jest.fn().mockResolvedValue(MEDJ) };
    findEditableJournal = jest.fn().mockResolvedValue(MEDJ);

    const moduleRef = await Test.createTestingModule({
      providers: [
        EditorialBoardService,
        {
          provide: getRepositoryToken(EditorialBoardMember),
          useValue: membersRepo,
        },
        { provide: getRepositoryToken(Journal), useValue: journalsRepo },
        {
          provide: JournalMetadataService,
          useValue: { findEditableJournal },
        },
      ],
    }).compile();

    service = moduleRef.get(EditorialBoardService);
  });

  describe('create', () => {
    it('adds a member at the end of the board with cleaned fields', async () => {
      const saved = await service.create(EDITOR, 'medj', {
        nameAr: '  عضو جديد ',
        nameEn: '',
        role: 'advisory_member',
        affiliationEn: ' Damascus University ',
        orcid: ' 0000-0000-0000-0028 ',
      });

      expect(saved).toMatchObject({
        id: 'm-new',
        nameAr: 'عضو جديد',
        nameEn: null,
        affiliationAr: null,
        affiliationEn: 'Damascus University',
        orcid: '0000-0000-0000-0028',
        sortOrder: 2,
      });
    });

    it('checks the caller may edit the journal before touching the board', async () => {
      findEditableJournal.mockRejectedValue(
        new ForbiddenException({ code: 'JOURNAL_OUT_OF_SCOPE' }),
      );

      await expect(
        service.create(EDITOR, 'engj', VALID),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(findEditableJournal).toHaveBeenCalledWith(EDITOR, 'engj');
      expect(membersRepo.save).not.toHaveBeenCalled();
    });

    it('requires a name in at least one language', async () => {
      await expect(
        service.create(EDITOR, 'medj', { ...VALID, nameEn: '  ' }),
      ).rejects.toMatchObject({ response: { code: 'BOARD_NAME_REQUIRED' } });
    });

    it('requires a role', async () => {
      await expect(
        service.create(EDITOR, 'medj', { ...VALID, role: undefined }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('requires an ORCID iD', async () => {
      await expect(
        service.create(EDITOR, 'medj', { ...VALID, orcid: null }),
      ).rejects.toMatchObject({ response: { code: 'ORCID_REQUIRED' } });
    });

    it('refuses an ORCID iD with a wrong check digit', async () => {
      await expect(
        service.create(EDITOR, 'medj', {
          ...VALID,
          orcid: '0000-0002-1825-0098',
        }),
      ).rejects.toMatchObject({ response: { code: 'INVALID_ORCID' } });
    });

    it('refuses the same person twice on one board', async () => {
      await expect(
        service.create(EDITOR, 'medj', {
          ...VALID,
          orcid: '0000-0002-1825-0097',
        }),
      ).rejects.toMatchObject({ response: { code: 'BOARD_MEMBER_DUPLICATE' } });
    });
  });

  describe('update', () => {
    it('changes only the fields sent', async () => {
      const saved = await service.update(EDITOR, 'medj', 'm-1', {
        affiliationEn: 'Faculty of Medicine, Damascus University',
      });

      expect(saved).toMatchObject({
        id: 'm-1',
        nameAr: 'عضو تجريبي',
        role: 'editor_in_chief',
        orcid: '0000-0002-1825-0097',
        affiliationEn: 'Faculty of Medicine, Damascus University',
      });
    });

    it('lets a member keep their own ORCID iD', async () => {
      await expect(
        service.update(EDITOR, 'medj', 'm-1', {
          orcid: '0000-0002-1825-0097',
          role: 'deputy_editor_in_chief',
        }),
      ).resolves.toMatchObject({ role: 'deputy_editor_in_chief' });
    });

    it('answers not found for a member of another journal', async () => {
      await expect(
        service.update(EDITOR, 'medj', 'm-elsewhere', { nameEn: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('removes a member of the board', async () => {
    await expect(service.remove(EDITOR, 'medj', 'm-2')).resolves.toEqual({
      ok: true,
    });
    expect(membersRepo.remove).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'm-2' }),
    );
  });

  describe('reorder', () => {
    it('stores the order exactly as listed', async () => {
      const rows = await service.reorder(EDITOR, 'medj', ['m-2', 'm-1']);

      expect(rows.map((r) => [r.id, r.sortOrder])).toEqual([
        ['m-2', 0],
        ['m-1', 1],
      ]);
    });

    it('refuses an order that drops or repeats a member', async () => {
      await expect(
        service.reorder(EDITOR, 'medj', ['m-2']),
      ).rejects.toMatchObject({ response: { code: 'BOARD_ORDER_MISMATCH' } });
      await expect(
        service.reorder(EDITOR, 'medj', ['m-2', 'm-2']),
      ).rejects.toMatchObject({ response: { code: 'BOARD_ORDER_MISMATCH' } });
      expect(membersRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('listPublic', () => {
    it('publishes the board without internal ids or sort keys', async () => {
      const rows = await service.listPublic('medj');

      expect(rows).toHaveLength(2);
      expect(rows[0]).not.toHaveProperty('id');
      expect(rows[0]).not.toHaveProperty('sortOrder');
      expect(findEditableJournal).not.toHaveBeenCalled();
    });

    it('hides the board of an unknown or inactive journal', async () => {
      journalsRepo.findOne.mockResolvedValue(null);

      await expect(service.listPublic('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
