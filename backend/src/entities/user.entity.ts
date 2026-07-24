import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  UpdateDateColumn,
} from 'typeorm';
import { BaseEntity } from '../common/base.entity';
import { Submission } from './submission.entity';
import { ReviewAssignment } from './review-assignment.entity';
import { CopyeditAssignment } from './copyedit-assignment.entity';
import { UserRole } from './user-role.entity';
import { UserSectionEditorDiscipline } from './user-section-editor-discipline.entity';

@Entity('users')
export class User extends BaseEntity {
  @Column({ unique: true })
  email: string;

  /** Null for ORCID-only accounts until a password is set. */
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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => UserRole, (ur) => ur.user)
  userRoles: UserRole[];

  @OneToMany(() => Submission, (s) => s.author)
  submissions: Submission[];

  @OneToMany(() => ReviewAssignment, (a) => a.reviewer)
  reviewAssignments: ReviewAssignment[];

  @OneToMany(() => CopyeditAssignment, (a) => a.copyeditor)
  copyeditAssignments: CopyeditAssignment[];

  @OneToMany(() => UserSectionEditorDiscipline, (d) => d.user)
  sectionEditorDisciplines: UserSectionEditorDiscipline[];
}
