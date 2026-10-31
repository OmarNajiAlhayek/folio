import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import type { RequestUser } from '../common/types/request-user';
import { Journal } from '../entities/journal.entity';
import { PERMISSION_SLUGS, ROLE_SLUGS } from '../rbac/permission-slugs';
import type { UpdateJournalMetadataDto } from './dto/update-journal-metadata.dto';
import { normalizeIssn } from './issn.util';
import { JournalMembershipService } from './journal-membership.service';

export type EditableJournal = {
  slug: string;
  titleAr: string;
  titleEn: string;
  issn: string | null;
  eissn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  /** Being listed already means ISSNs and scope are editable; titles are narrower. */
  canEditTitles: boolean;
  updatedAt: Date;
};

const TITLE_FIELDS = ['titleAr', 'titleEn'] as const;
const ISSN_FIELDS = ['issn', 'eissn'] as const;
const DESCRIPTION_FIELDS = ['descriptionAr', 'descriptionEn'] as const;

/**
 * Staff editing of the journal fields Damascus University decided are
 * maintained in the app rather than shipped in code (2026-09-14):
 *
 * | Fields | Who |
 * |---|---|
 * | `title_ar`, `title_en` | journal manager only |
 * | `issn`, `eissn`, `description_ar`, `description_en` | journal manager, or that journal's editor-in-chief |
 *
 * Titles are narrower because Scholar, DOAJ and the citation tags match on
 * them. Aims and scope change hands with each year's editor-in-chief.
 *
 * A journal manager acts only where they hold a `journal_manager` membership.
 * An editor-in-chief acts only where they hold an `editor` membership.
 * Titles stay with the manager of that journal.
 *
 * `JOURNAL_CATALOG` only seeded these columns. Nothing re-applies it, so a
 * value saved here stands until someone edits it again.
 */
@Injectable()
export class JournalMetadataService {
  constructor(
    @InjectRepository(Journal)
    private readonly journalsRepo: Repository<Journal>,
    private readonly memberships: JournalMembershipService,
  ) {}

  /**
   * Journals this caller may edit, in display order. Inactive journals are
   * included: a retired title's archive still publishes its ISSN.
   */
  async listEditable(user: RequestUser): Promise<EditableJournal[]> {
    const managerIds = await this.managerJournalIds(user);
    const editorIds = await this.editorJournalIds(user);
    const ids = [...new Set([...managerIds, ...editorIds])];
    if (ids.length === 0) return [];
    const mine = await this.journalsRepo.find({
      where: { id: In(ids) },
      order: { sortOrder: 'ASC' },
    });
    const titleIds = new Set(managerIds);
    return mine.map((j) =>
      this.toEditable(j, titleIds.has(j.id) && this.canEditTitles(user)),
    );
  }

  /**
   * The journal at `slug`, if this caller may edit it: any journal for the
   * journal manager, otherwise only one they are editor-in-chief of. Shared
   * with the editorial board, which the university put under the same rule as
   * aims and scope (2026-09-14).
   */
  async findEditableJournal(user: RequestUser, slug: string): Promise<Journal> {
    const journal = await this.journalsRepo.findOne({ where: { slug } });
    if (!journal) {
      throw new NotFoundException({
        message: 'Journal not found',
        code: 'NOT_FOUND',
      });
    }
    const allowed = new Set([
      ...(await this.managerJournalIds(user)),
      ...(await this.editorJournalIds(user)),
    ]);
    if (!allowed.has(journal.id)) {
      throw new ForbiddenException({
        message: 'You can only edit journals you manage or edit',
        code: 'JOURNAL_OUT_OF_SCOPE',
      });
    }
    return journal;
  }

  /** The journal a reader can submit to. Inactive titles are not offered. */
  async findPublicJournal(slug: string): Promise<Journal> {
    const journal = await this.journalsRepo.findOne({
      where: { slug, isActive: true },
    });
    if (!journal) {
      throw new NotFoundException({
        message: 'Journal not found',
        code: 'NOT_FOUND',
      });
    }
    return journal;
  }

  /** Sections and registered titles: the manager of this journal only. */
  async findManagedJournal(user: RequestUser, slug: string): Promise<Journal> {
    const journal = await this.journalsRepo.findOne({ where: { slug } });
    if (!journal) {
      throw new NotFoundException({
        message: 'Journal not found',
        code: 'NOT_FOUND',
      });
    }
    const managerIds = await this.managerJournalIds(user);
    if (!managerIds.includes(journal.id)) {
      throw new ForbiddenException({
        message: 'You can only edit sections of a journal you manage',
        code: 'JOURNAL_OUT_OF_SCOPE',
      });
    }
    return journal;
  }

  async update(
    user: RequestUser,
    slug: string,
    dto: UpdateJournalMetadataDto,
  ): Promise<EditableJournal> {
    const journal = await this.findEditableJournal(user, slug);
    const canEditTitles =
      (await this.managerJournalIds(user)).includes(journal.id) &&
      this.canEditTitles(user);
    const patch: Partial<Journal> = {};

    for (const field of TITLE_FIELDS) {
      const next = dto[field]?.trim();
      // An unchanged title is not an edit, so a form that always sends every
      // field does not trip the journal-manager-only rule.
      if (next === undefined || next === journal[field]) continue;
      if (!canEditTitles) {
        throw new ForbiddenException({
          message: 'Only the journal manager can change journal titles',
          code: 'JOURNAL_TITLES_FORBIDDEN',
        });
      }
      if (next === '') {
        throw new BadRequestException({
          message: `${field} cannot be empty`,
          code: 'VALIDATION_ERROR',
        });
      }
      patch[field] = next;
    }

    for (const field of ISSN_FIELDS) {
      const raw = dto[field];
      if (raw === undefined) continue;
      patch[field] = this.parseIssn(raw, field);
    }

    for (const field of DESCRIPTION_FIELDS) {
      const raw = dto[field];
      if (raw === undefined) continue;
      const text = raw?.trim() ?? '';
      patch[field] = text === '' ? null : text;
    }

    if (patch.issn !== undefined || patch.eissn !== undefined) {
      await this.assertIssnsUsable(
        journal.id,
        patch.issn !== undefined ? patch.issn : journal.issn,
        patch.eissn !== undefined ? patch.eissn : journal.eissn,
      );
    }

    const saved =
      Object.keys(patch).length > 0
        ? await this.journalsRepo.save(Object.assign(journal, patch))
        : journal;
    return this.toEditable(saved, canEditTitles);
  }

  private canEditTitles(user: RequestUser): boolean {
    return user.permissionSlugs.includes(PERMISSION_SLUGS.JOURNAL_EDIT_TITLES);
  }

  private editorJournalIds(user: RequestUser): Promise<string[]> {
    if (!user.roleSlugs.includes(ROLE_SLUGS.EDITOR)) return Promise.resolve([]);
    return this.memberships.listJournalIdsForUser(user.sub, ROLE_SLUGS.EDITOR);
  }

  private managerJournalIds(user: RequestUser): Promise<string[]> {
    if (!user.roleSlugs.includes(ROLE_SLUGS.JOURNAL_MANAGER)) {
      return Promise.resolve([]);
    }
    return this.memberships.listJournalIdsForUser(
      user.sub,
      ROLE_SLUGS.JOURNAL_MANAGER,
    );
  }

  private parseIssn(raw: string | null, field: 'issn' | 'eissn') {
    if (raw === null || raw.trim() === '') return null;
    const issn = normalizeIssn(raw);
    if (!issn) {
      throw new BadRequestException({
        message: `${field} is not a valid ISSN (NNNN-NNNC with a correct check digit)`,
        code: 'INVALID_ISSN',
        field,
      });
    }
    return issn;
  }

  /**
   * An ISSN names exactly one edition of one title. The print and electronic
   * editions carry different numbers, and no two journals share one.
   */
  private async assertIssnsUsable(
    journalId: string,
    issn: string | null,
    eissn: string | null,
  ): Promise<void> {
    if (issn && eissn && issn === eissn) {
      throw new BadRequestException({
        message: 'The print ISSN and the e-ISSN must be different numbers',
        code: 'ISSN_DUPLICATE',
      });
    }
    const numbers = [issn, eissn].filter((n): n is string => Boolean(n));
    if (numbers.length === 0) return;
    const clash = await this.journalsRepo.findOne({
      where: [
        { id: Not(journalId), issn: In(numbers) },
        { id: Not(journalId), eissn: In(numbers) },
      ],
      select: ['id', 'slug'],
    });
    if (clash) {
      throw new BadRequestException({
        message: `That ISSN already belongs to the journal "${clash.slug}"`,
        code: 'ISSN_IN_USE',
      });
    }
  }

  private toEditable(j: Journal, canEditTitles: boolean): EditableJournal {
    return {
      slug: j.slug,
      titleAr: j.titleAr,
      titleEn: j.titleEn,
      issn: j.issn,
      eissn: j.eissn,
      descriptionAr: j.descriptionAr,
      descriptionEn: j.descriptionEn,
      canEditTitles,
      updatedAt: j.updatedAt,
    };
  }
}
