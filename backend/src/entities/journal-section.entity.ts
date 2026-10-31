import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  UpdateDateColumn,
} from 'typeorm';
import { BaseEntity } from '../common/base.entity';
import { Journal } from './journal.entity';
import { SectionEditorLink } from './section-editor.entity';

/**
 * A section inside one journal (OJS section). Flat: a section has no
 * editor-in-chief of its own, and the author picks it at submission.
 */
@Entity('sections')
@Index('ix_sections_journal_sort', ['journalId', 'sortOrder'])
export class JournalSection extends BaseEntity {
  @Column({ name: 'journal_id', type: 'uuid' })
  journalId: string;

  @ManyToOne(() => Journal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'journal_id' })
  journal: Journal;

  @Column({ name: 'name_ar', type: 'varchar', length: 200 })
  nameAr: string;

  @Column({ name: 'name_en', type: 'varchar', length: 200 })
  nameEn: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => SectionEditorLink, (link) => link.section)
  editors: SectionEditorLink[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
