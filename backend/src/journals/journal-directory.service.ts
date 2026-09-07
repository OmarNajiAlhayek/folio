import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Journal } from '../entities/journal.entity';

/**
 * One row of the author's journal picker. Deliberately thinner than
 * `PortalJournal`: the picker needs identity and titles, not article counts or
 * the latest issue, and it must carry the `id` the submission DTO stores.
 */
export type JournalOption = {
  id: string;
  slug: string;
  titleAr: string;
  titleEn: string;
  disciplineLabel: string;
};

/**
 * Journal reference data for the authenticated author journal picker.
 * Separate from {@link JournalPortalService}, which is the public
 * read model and must stay free of anything a reader should not see.
 *
 * `isActive: false` hides a journal here as well as on the portal — a retired
 * journal keeps its archive but stops accepting manuscripts.
 */
@Injectable()
export class JournalDirectoryService {
  constructor(
    @InjectRepository(Journal)
    private readonly journalsRepo: Repository<Journal>,
  ) {}

  /** Every journal accepting submissions, in the catalog's display order. */
  async listOptions(): Promise<JournalOption[]> {
    const rows = await this.journalsRepo.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC' },
    });
    return rows.map((j) => this.toOption(j));
  }

  /**
   * The journal an author chose must exist and still accept manuscripts.
   * Checked before insert so a stale picker option is a 400 rather than a
   * foreign-key 500.
   */
  async assertSubmittableJournal(journalId: string): Promise<Journal> {
    const journal = await this.journalsRepo.findOne({
      where: { id: journalId },
    });
    if (!journal || !journal.isActive) {
      throw new BadRequestException({
        message: 'Selected journal is not accepting submissions',
        code: 'JOURNAL_NOT_AVAILABLE',
      });
    }
    return journal;
  }

  private toOption(j: Journal): JournalOption {
    return {
      id: j.id,
      slug: j.slug,
      titleAr: j.titleAr,
      titleEn: j.titleEn,
      disciplineLabel: j.disciplineLabel,
    };
  }
}
