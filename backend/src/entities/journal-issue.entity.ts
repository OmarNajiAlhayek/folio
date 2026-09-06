import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { BaseEntity } from '../common/base.entity';
import { Journal } from './journal.entity';
import { JournalIssueStatus } from './journal-issue-status.enum';
import { Submission } from './submission.entity';

/**
 * A published bundle inside one journal, cited as **العدد N، السنة YYYY**
 * (`No. N (YYYY)` in English). `volume` (المجلد) is stored for DU alignment
 * but is never required by the public citation — see `journal-citation.ts`.
 */
@Entity('journal_issues')
@Unique('uq_journal_issues_journal_year_number', [
  'journalId',
  'year',
  'number',
])
// The UNIQUE constraint above already provides the (journal, year, number)
// btree used by issue lookups; only the public archive ordering needs its own.
@Index('ix_journal_issues_status_published_at', ['status', 'publishedAt'])
export class JournalIssue extends BaseEntity {
  @Column({ name: 'journal_id' })
  journalId: string;

  @ManyToOne(() => Journal, (j) => j.issues, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'journal_id' })
  journal: Journal;

  /** السنة — Gregorian year of the issue. */
  @Column({ type: 'int' })
  year: number;

  /** العدد — positive, unique within (journal, year). */
  @Column({ type: 'int' })
  number: number;

  /** المجلد — optional; staff-facing only. */
  @Column({ type: 'int', nullable: true })
  volume: number | null;

  /** Special-issue title; the citation stands on its own without it. */
  @Column({ name: 'title_ar', type: 'varchar', length: 300, nullable: true })
  titleAr: string | null;

  @Column({ name: 'title_en', type: 'varchar', length: 300, nullable: true })
  titleEn: string | null;

  @Column({
    type: 'enum',
    enum: JournalIssueStatus,
    default: JournalIssueStatus.PLANNED,
  })
  status: JournalIssueStatus;

  /** When the issue was released as a unit; null until `published`. */
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => Submission, (s) => s.issue)
  articles: Submission[];
}
