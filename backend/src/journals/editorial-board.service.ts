import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { normalizeValidOrcidId } from '../auth/orcid-id.util';
import type { RequestUser } from '../common/types/request-user';
import {
  EDITORIAL_BOARD_ROLES,
  EditorialBoardMember,
  type EditorialBoardRole,
} from '../entities/editorial-board-member.entity';
import { Journal } from '../entities/journal.entity';
import type { EditorialBoardMemberDto } from './dto/editorial-board.dto';
import { JournalMetadataService } from './journal-metadata.service';

/** What a reader sees. Array order is board order; ids and sort keys stay internal. */
export type PublicEditorialBoardMember = {
  nameAr: string | null;
  nameEn: string | null;
  role: EditorialBoardRole;
  affiliationAr: string | null;
  affiliationEn: string | null;
  orcid: string | null;
};

export type EditorialBoardMemberView = PublicEditorialBoardMember & {
  id: string;
  sortOrder: number;
};

type MemberInput = {
  nameAr?: string | null;
  nameEn?: string | null;
  role?: string;
  affiliationAr?: string | null;
  affiliationEn?: string | null;
  orcid?: string | null;
};

type MemberFields = Omit<PublicEditorialBoardMember, 'orcid'> & {
  orcid: string;
};

function clean(value: string | null | undefined): string | null {
  const text = value?.trim() ?? '';
  return text === '' ? null : text;
}

function toPublic(m: EditorialBoardMember): PublicEditorialBoardMember {
  return {
    nameAr: m.nameAr,
    nameEn: m.nameEn,
    role: m.role,
    affiliationAr: m.affiliationAr,
    affiliationEn: m.affiliationEn,
    orcid: m.orcid,
  };
}

function toView(m: EditorialBoardMember): EditorialBoardMemberView {
  return { id: m.id, ...toPublic(m), sortOrder: m.sortOrder };
}

/**
 * A journal's published editorial board — the page DOAJ asks for — kept apart
 * from staff accounts, since most board members never log in.
 *
 * Editing follows the rule the university set for aims and scope (confirmed
 * 2026-09-14): the journal manager, or that journal's editor-in-chief. The
 * scope check is {@link JournalMetadataService.findEditableJournal}, so the two
 * surfaces cannot drift apart.
 *
 * Every member needs a valid ORCID iD: the university requires one of all
 * editorial board members (2026-09-12) and made ORCID every participant's
 * primary identifier (2026-09-14). It also identifies a person on the board,
 * so the same iD cannot be listed twice in one journal.
 *
 * Boards are a few dozen rows, so each write loads the whole board and checks
 * order and duplicates in memory rather than with extra queries.
 */
@Injectable()
export class EditorialBoardService {
  constructor(
    @InjectRepository(EditorialBoardMember)
    private readonly membersRepo: Repository<EditorialBoardMember>,
    @InjectRepository(Journal)
    private readonly journalsRepo: Repository<Journal>,
    private readonly metadata: JournalMetadataService,
  ) {}

  async listForStaff(
    user: RequestUser,
    slug: string,
  ): Promise<EditorialBoardMemberView[]> {
    const journal = await this.metadata.findEditableJournal(user, slug);
    return (await this.membersOf(journal.id)).map(toView);
  }

  async create(
    user: RequestUser,
    slug: string,
    dto: EditorialBoardMemberDto,
  ): Promise<EditorialBoardMemberView> {
    const journal = await this.metadata.findEditableJournal(user, slug);
    const board = await this.membersOf(journal.id);
    const fields = this.validated(dto, board, null);
    const sortOrder = board.reduce((max, m) => Math.max(max, m.sortOrder), -1);
    const saved = await this.membersRepo.save(
      this.membersRepo.create({
        ...fields,
        journalId: journal.id,
        sortOrder: sortOrder + 1,
      }),
    );
    return toView(saved);
  }

  async update(
    user: RequestUser,
    slug: string,
    id: string,
    dto: EditorialBoardMemberDto,
  ): Promise<EditorialBoardMemberView> {
    const journal = await this.metadata.findEditableJournal(user, slug);
    const board = await this.membersOf(journal.id);
    const member = this.memberIn(board, id);
    const next = <T>(sent: T | undefined, current: T): T =>
      sent === undefined ? current : sent;
    const fields = this.validated(
      {
        nameAr: next(dto.nameAr, member.nameAr),
        nameEn: next(dto.nameEn, member.nameEn),
        role: next(dto.role, member.role),
        affiliationAr: next(dto.affiliationAr, member.affiliationAr),
        affiliationEn: next(dto.affiliationEn, member.affiliationEn),
        orcid: next(dto.orcid, member.orcid),
      },
      board,
      member.id,
    );
    const saved = await this.membersRepo.save(Object.assign(member, fields));
    return toView(saved);
  }

  async remove(
    user: RequestUser,
    slug: string,
    id: string,
  ): Promise<{ ok: true }> {
    const journal = await this.metadata.findEditableJournal(user, slug);
    const member = this.memberIn(await this.membersOf(journal.id), id);
    await this.membersRepo.remove(member);
    return { ok: true };
  }

  /** `ids` must name every member of the board exactly once. */
  async reorder(
    user: RequestUser,
    slug: string,
    ids: string[],
  ): Promise<EditorialBoardMemberView[]> {
    const journal = await this.metadata.findEditableJournal(user, slug);
    const board = await this.membersOf(journal.id);
    const byId = new Map(board.map((m) => [m.id, m]));
    const complete =
      ids.length === board.length &&
      new Set(ids).size === ids.length &&
      ids.every((id) => byId.has(id));
    if (!complete) {
      throw new BadRequestException({
        message: 'The new order must list every member of this board once',
        code: 'BOARD_ORDER_MISMATCH',
      });
    }
    const reordered: EditorialBoardMember[] = [];
    ids.forEach((id, index) => {
      const member = byId.get(id);
      if (!member) return;
      member.sortOrder = index;
      reordered.push(member);
    });
    await this.membersRepo.save(reordered);
    return reordered.map(toView);
  }

  /** The board of an active journal, for the public page. */
  async listPublic(slug: string): Promise<PublicEditorialBoardMember[]> {
    const journal = await this.journalsRepo.findOne({
      where: { slug, isActive: true },
      select: ['id'],
    });
    if (!journal) {
      throw new NotFoundException({
        message: 'Journal not found',
        code: 'NOT_FOUND',
      });
    }
    return (await this.membersOf(journal.id)).map(toPublic);
  }

  private membersOf(journalId: string): Promise<EditorialBoardMember[]> {
    return this.membersRepo.find({
      where: { journalId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  private memberIn(
    board: EditorialBoardMember[],
    id: string,
  ): EditorialBoardMember {
    const member = board.find((m) => m.id === id);
    if (!member) {
      throw new NotFoundException({
        message: 'Board member not found in this journal',
        code: 'NOT_FOUND',
      });
    }
    return member;
  }

  private validated(
    input: MemberInput,
    board: EditorialBoardMember[],
    selfId: string | null,
  ): MemberFields {
    const nameAr = clean(input.nameAr);
    const nameEn = clean(input.nameEn);
    if (!nameAr && !nameEn) {
      throw new BadRequestException({
        message: 'Enter the member name in Arabic, English, or both',
        code: 'BOARD_NAME_REQUIRED',
      });
    }

    const role = EDITORIAL_BOARD_ROLES.find((r) => r === input.role);
    if (!role) {
      throw new BadRequestException({
        message: `role must be one of: ${EDITORIAL_BOARD_ROLES.join(', ')}`,
        code: 'VALIDATION_ERROR',
      });
    }

    const rawOrcid = clean(input.orcid);
    if (!rawOrcid) {
      throw new BadRequestException({
        message: 'Every editorial board member needs an ORCID iD',
        code: 'ORCID_REQUIRED',
      });
    }
    const orcid = normalizeValidOrcidId(rawOrcid);
    if (!orcid) {
      throw new BadRequestException({
        message:
          'orcid is not a valid ORCID iD (0000-0000-0000-000X with a correct check digit)',
        code: 'INVALID_ORCID',
      });
    }
    if (board.some((m) => m.id !== selfId && m.orcid === orcid)) {
      throw new BadRequestException({
        message: 'This person is already on the board',
        code: 'BOARD_MEMBER_DUPLICATE',
      });
    }

    return {
      nameAr,
      nameEn,
      role,
      affiliationAr: clean(input.affiliationAr),
      affiliationEn: clean(input.affiliationEn),
      orcid,
    };
  }
}
