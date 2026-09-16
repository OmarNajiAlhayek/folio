import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  UpdateDateColumn,
} from 'typeorm';
import { BaseEntity } from '../common/base.entity';
import { Journal } from './journal.entity';

/** Board positions, in the order the public page lists them. */
export const EDITORIAL_BOARD_ROLES = [
  'editor_in_chief',
  'deputy_editor_in_chief',
  'managing_editor',
  'member',
  'advisory_member',
] as const;

export type EditorialBoardRole = (typeof EDITORIAL_BOARD_ROLES)[number];

/**
 * One person on a journal's **published** editorial board.
 *
 * Deliberately not a user. Most board members — external and advisory members
 * above all — never log in, and `journal_memberships` answers a different
 * question: which journals a staff account may *act* in. This table is what a
 * reader and DOAJ see: names, affiliations and roles.
 *
 * `orcid` is nullable in the database but required by `EditorialBoardService`,
 * following the university's rule that ORCID identifies every participant.
 * Relaxing that is a service change, not a migration.
 */
@Entity('editorial_board_members')
@Index('ix_editorial_board_members_journal_sort', ['journalId', 'sortOrder'])
export class EditorialBoardMember extends BaseEntity {
  @Column({ name: 'journal_id', type: 'uuid' })
  journalId: string;

  @ManyToOne(() => Journal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'journal_id' })
  journal: Journal;

  /** At least one of the two names is present (database CHECK). */
  @Column({ name: 'name_ar', type: 'varchar', length: 200, nullable: true })
  nameAr: string | null;

  @Column({ name: 'name_en', type: 'varchar', length: 200, nullable: true })
  nameEn: string | null;

  @Column({ type: 'varchar', length: 30 })
  role: EditorialBoardRole;

  @Column({
    name: 'affiliation_ar',
    type: 'varchar',
    length: 300,
    nullable: true,
  })
  affiliationAr: string | null;

  @Column({
    name: 'affiliation_en',
    type: 'varchar',
    length: 300,
    nullable: true,
  })
  affiliationEn: string | null;

  @Column({ type: 'varchar', length: 19, nullable: true })
  orcid: string | null;

  /** Position on the board page; ties broken by `created_at`. */
  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
