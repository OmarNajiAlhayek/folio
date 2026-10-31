import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { RequestUser } from '../common/types/request-user';
import { JournalSection } from '../entities/journal-section.entity';
import { SectionEditorLink } from '../entities/section-editor.entity';
import { ROLE_SLUGS } from '../rbac/permission-slugs';
import { RbacService } from '../rbac/rbac.service';
import type {
  CreateJournalSectionDto,
  SetSectionEditorsDto,
  UpdateJournalSectionDto,
} from './dto/journal-section.dto';
import { JournalMembershipService } from './journal-membership.service';
import { JournalMetadataService } from './journal-metadata.service';

export type SectionEditorView = {
  userId: string;
  displayName: string;
  email: string;
  canRecordDecision: boolean;
};

export type JournalSectionView = {
  id: string;
  nameAr: string;
  nameEn: string;
  sortOrder: number;
  isActive: boolean;
  editors: SectionEditorView[];
};

/**
 * Sections belong to one journal. Only that journal's manager creates them
 * and links section editors. The public list is the active sections an
 * author may choose.
 */
@Injectable()
export class JournalSectionsService {
  constructor(
    @InjectRepository(JournalSection)
    private readonly sectionsRepo: Repository<JournalSection>,
    @InjectRepository(SectionEditorLink)
    private readonly linksRepo: Repository<SectionEditorLink>,
    private readonly metadata: JournalMetadataService,
    private readonly memberships: JournalMembershipService,
    private readonly rbac: RbacService,
  ) {}

  async listActiveBySlug(slug: string): Promise<JournalSectionView[]> {
    const journal = await this.metadata.findPublicJournal(slug);
    const rows = await this.sectionsRepo.find({
      where: { journalId: journal.id, isActive: true },
      order: { sortOrder: 'ASC', nameEn: 'ASC' },
    });
    return rows.map((row) => this.toView(row, []));
  }

  async listForManager(
    user: RequestUser,
    slug: string,
  ): Promise<JournalSectionView[]> {
    const journal = await this.metadata.findManagedJournal(user, slug);
    const rows = await this.sectionsRepo.find({
      where: { journalId: journal.id },
      relations: { editors: { user: true } },
      order: { sortOrder: 'ASC', nameEn: 'ASC' },
    });
    return rows.map((row) => this.toView(row, row.editors ?? []));
  }

  async create(
    user: RequestUser,
    slug: string,
    dto: CreateJournalSectionDto,
  ): Promise<JournalSectionView> {
    const journal = await this.metadata.findManagedJournal(user, slug);
    const saved = await this.sectionsRepo.save(
      this.sectionsRepo.create({
        journalId: journal.id,
        nameAr: dto.nameAr.trim(),
        nameEn: dto.nameEn.trim(),
        sortOrder: dto.sortOrder ?? 0,
        isActive: true,
      }),
    );
    return this.toView(saved, []);
  }

  async update(
    user: RequestUser,
    slug: string,
    sectionId: string,
    dto: UpdateJournalSectionDto,
  ): Promise<JournalSectionView> {
    const section = await this.managedSection(user, slug, sectionId);
    if (dto.nameAr !== undefined) section.nameAr = dto.nameAr.trim();
    if (dto.nameEn !== undefined) section.nameEn = dto.nameEn.trim();
    if (dto.sortOrder !== undefined) section.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) section.isActive = dto.isActive;
    const saved = await this.sectionsRepo.save(section);
    const editors = await this.linksRepo.find({
      where: { sectionId: saved.id },
      relations: { user: true },
    });
    return this.toView(saved, editors);
  }

  /**
   * Replaces the standing editor links on this section. Each user must
   * already hold the section-editor role; membership on the journal is
   * created so the permission scope matches the link.
   */
  async setEditors(
    user: RequestUser,
    slug: string,
    sectionId: string,
    dto: SetSectionEditorsDto,
  ): Promise<JournalSectionView> {
    const section = await this.managedSection(user, slug, sectionId);
    const previous = await this.linksRepo.find({
      where: { sectionId: section.id },
      select: ['userId'],
    });
    const seen = new Set<string>();
    for (const editor of dto.editors) {
      if (seen.has(editor.userId)) {
        throw new BadRequestException({
          message: 'Each section editor can be linked once',
          code: 'VALIDATION_ERROR',
        });
      }
      seen.add(editor.userId);
      const roles = await this.rbac.getEffectiveForUser(editor.userId);
      if (!roles.roleSlugs.includes(ROLE_SLUGS.SECTION_EDITOR)) {
        throw new BadRequestException({
          message: 'That user is not a section editor',
          code: 'VALIDATION_ERROR',
        });
      }
    }

    await this.linksRepo.manager.transaction(async (em) => {
      const repo = em.getRepository(SectionEditorLink);
      await repo.delete({ sectionId: section.id });
      if (dto.editors.length > 0) {
        await repo.save(
          dto.editors.map((editor) =>
            repo.create({
              sectionId: section.id,
              userId: editor.userId,
              canRecordDecision: editor.canRecordDecision,
            }),
          ),
        );
      }
    });

    for (const editor of dto.editors) {
      const current = await this.memberships.journalSlugsForUser(
        editor.userId,
        ROLE_SLUGS.SECTION_EDITOR,
      );
      if (!current.includes(slug)) {
        await this.memberships.setJournalSlugsForUser(
          editor.userId,
          ROLE_SLUGS.SECTION_EDITOR,
          [...current, slug],
        );
      }
    }

    const kept = new Set(dto.editors.map((editor) => editor.userId));
    for (const link of previous) {
      if (kept.has(link.userId)) continue;
      const remaining = await this.linksRepo
        .createQueryBuilder('link')
        .innerJoin('link.section', 'section')
        .where('link.userId = :userId', { userId: link.userId })
        .andWhere('section.journalId = :journalId', {
          journalId: section.journalId,
        })
        .getCount();
      if (remaining > 0) continue;
      const current = await this.memberships.journalSlugsForUser(
        link.userId,
        ROLE_SLUGS.SECTION_EDITOR,
      );
      if (!current.includes(slug)) continue;
      await this.memberships.setJournalSlugsForUser(
        link.userId,
        ROLE_SLUGS.SECTION_EDITOR,
        current.filter((item) => item !== slug),
      );
    }

    const editors = await this.linksRepo.find({
      where: { sectionId: section.id },
      relations: { user: true },
    });
    return this.toView(section, editors);
  }

  private async managedSection(
    user: RequestUser,
    slug: string,
    sectionId: string,
  ): Promise<JournalSection> {
    const journal = await this.metadata.findManagedJournal(user, slug);
    const section = await this.sectionsRepo.findOne({
      where: { id: sectionId, journalId: journal.id },
    });
    if (!section) {
      throw new NotFoundException({
        message: 'Section not found',
        code: 'NOT_FOUND',
      });
    }
    return section;
  }

  private toView(
    section: JournalSection,
    editors: SectionEditorLink[],
  ): JournalSectionView {
    return {
      id: section.id,
      nameAr: section.nameAr,
      nameEn: section.nameEn,
      sortOrder: section.sortOrder,
      isActive: section.isActive,
      editors: editors
        .map((link) => ({
          userId: link.userId,
          displayName: link.user?.displayName ?? '',
          email: link.user?.email ?? '',
          canRecordDecision: link.canRecordDecision,
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    };
  }
}
