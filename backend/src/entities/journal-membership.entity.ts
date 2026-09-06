import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  Unique,
} from 'typeorm';
import { BaseEntity } from '../common/base.entity';
import { Journal } from './journal.entity';
import { User } from './user.entity';

/**
 * Scopes a staff user to one journal. RBAC still grants the *permission*
 * globally (`user_roles` → `role_permissions`); membership answers the
 * separate question "which journals may this editor act in".
 *
 * `role_slug` is denormalized rather than an FK to `roles` so the hot
 * predicate — "journals where this user is an editor" — stays a single
 * indexed lookup with no join. Values come from `ROLE_SLUGS`; the
 * university-wide `journal_manager` is intentionally *not* scoped here.
 */
@Entity('journal_memberships')
@Unique('uq_journal_memberships_journal_user_role', [
  'journalId',
  'userId',
  'roleSlug',
])
@Index('ix_journal_memberships_user_role', ['userId', 'roleSlug'])
@Index('ix_journal_memberships_journal_role', ['journalId', 'roleSlug'])
export class JournalMembership extends BaseEntity {
  @Column({ name: 'journal_id' })
  journalId: string;

  @ManyToOne(() => Journal, (j) => j.memberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'journal_id' })
  journal: Journal;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, (u) => u.journalMemberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** `editor` | `section_editor` | `reviewer` | `copyeditor`. */
  @Column({ name: 'role_slug', type: 'varchar', length: 30 })
  roleSlug: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
