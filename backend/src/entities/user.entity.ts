import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  UpdateDateColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { BaseEntity } from '../common/base.entity';
import { Submission } from './submission.entity';
import { ReviewAssignment } from './review-assignment.entity';
import { CopyeditAssignment } from './copyedit-assignment.entity';
import { UserRole } from './user-role.entity';
import { JournalMembership } from './journal-membership.entity';

@Entity('users')
export class User extends BaseEntity {
  @Column({ unique: true })
  email: string;

  /**
   * Null for ORCID-only accounts until a password is set.
   *
   * `@Exclude()` + the global `ClassSerializerInterceptor` strip this from any
   * response that serializes a `User` instance. That is the backstop; handlers
   * are still expected to map through `users/user-summary.ts` rather than
   * return user rows or relations directly.
   */
  @Exclude()
  @Column({ name: 'password_hash', type: 'varchar', nullable: true })
  passwordHash: string | null;

  @Column({ name: 'display_name' })
  displayName: string;

  /** Institution / department (free text). */
  @Column({ type: 'varchar', length: 500, nullable: true })
  affiliation: string | null;

  /** Canonical ORCID (e.g. 0000-0001-2345-6789). */
  @Column({ type: 'varchar', length: 19, nullable: true, unique: true })
  orcid: string | null;

  /** Comma-separated or short text; used for reviewer interest matching. */
  @Column({ name: 'review_keywords', type: 'text', nullable: true })
  reviewKeywords: string | null;

  @Column({ name: 'willing_to_review', default: false })
  willingToReview: boolean;

  /**
   * The reviewer's own "taking new invitations" switch. Read it through
   * `isReviewerAvailable` — a past `reviewerUnavailableUntil` overrides false.
   */
  @Column({ name: 'reviewer_available', default: true })
  reviewerAvailable: boolean;

  /** First day available again (`YYYY-MM-DD`); null with the switch off is open-ended. */
  @Column({ name: 'reviewer_unavailable_until', type: 'date', nullable: true })
  reviewerUnavailableUntil: string | null;

  /** Shown to editors while unavailable. */
  @Column({
    name: 'reviewer_unavailable_note',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  reviewerUnavailableNote: string | null;

  /** Invited + accepted review assignments allowed at once; null is no limit. */
  @Column({
    name: 'reviewer_max_active_reviews',
    type: 'smallint',
    nullable: true,
  })
  reviewerMaxActiveReviews: number | null;

  /** Preferred locale for transactional email (`en` | `ar`). */
  @Column({
    name: 'preferred_locale',
    type: 'varchar',
    length: 10,
    nullable: true,
  })
  preferredLocale: string | null;

  /** Set when the user confirms ownership of `email` via OTP. */
  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  /**
   * `display_name` and `email` folded by `folio_normalize_search` — a Postgres
   * generated column, queried via raw SQL in the role-admin search only.
   *
   * Declared here so TypeORM knows it exists: `DB_SYNCHRONIZE=true` in a dev
   * environment would otherwise see an unknown column and drop it.
   */
  @Column({
    name: 'search_normalized',
    type: 'text',
    nullable: true,
    insert: false,
    update: false,
    select: false,
  })
  searchNormalized?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => UserRole, (ur) => ur.user)
  userRoles: UserRole[];

  @OneToMany(() => Submission, (s) => s.author)
  submissions: Submission[];

  @OneToMany(() => ReviewAssignment, (a) => a.reviewer)
  reviewAssignments: ReviewAssignment[];

  @OneToMany(() => CopyeditAssignment, (a) => a.copyeditor)
  copyeditAssignments: CopyeditAssignment[];

  /** Journals this user may act in, per staff role. Global roles are not listed. */
  @OneToMany(() => JournalMembership, (m) => m.user)
  journalMemberships: JournalMembership[];
}
