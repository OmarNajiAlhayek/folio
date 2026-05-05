import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Submission } from './submission.entity';
import { ReviewAssignment } from './review-assignment.entity';
import { UserRole } from './user-role.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

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
}
