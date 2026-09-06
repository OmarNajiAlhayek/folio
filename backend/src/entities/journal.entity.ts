import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  UpdateDateColumn,
} from 'typeorm';
import { BaseEntity } from '../common/base.entity';
import { JournalIssue } from './journal-issue.entity';
import { JournalMembership } from './journal-membership.entity';

/**
 * One Damascus University journal — a topic with its own editorial home,
 * queue and public archive (e.g. مجلة جامعة دمشق للعلوم الهندسية).
 *
 * Replaces the old "one journal, submissions tagged with disciplines" model.
 * Rows are reference data seeded 1:1 from the AraBERT classifier labels; see
 * `src/journals/journal-catalog.ts`. `غير محدد` is deliberately not a journal.
 */
@Entity('journals')
export class Journal extends BaseEntity {
  /** Public URL key, stable like the DU OJS paths (`engj`, `hisj`, …). */
  @Column({ type: 'varchar', length: 40, unique: true })
  slug: string;

  @Column({ name: 'title_ar', type: 'varchar', length: 300 })
  titleAr: string;

  @Column({ name: 'title_en', type: 'varchar', length: 300 })
  titleEn: string;

  /**
   * Exact Arabic label emitted by the classifier. Unique, so a classifier
   * result maps to at most one journal without a second taxonomy.
   */
  @Column({ name: 'discipline_label', type: 'text', unique: true })
  disciplineLabel: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  issn: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  eissn: string | null;

  @Column({ name: 'description_ar', type: 'text', nullable: true })
  descriptionAr: string | null;

  @Column({ name: 'description_en', type: 'text', nullable: true })
  descriptionEn: string | null;

  /** Soft hide from the author picker and the public portal; rows are never deleted. */
  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => JournalIssue, (i) => i.journal)
  issues: JournalIssue[];

  @OneToMany(() => JournalMembership, (m) => m.journal)
  memberships: JournalMembership[];
}
