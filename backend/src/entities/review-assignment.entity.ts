import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { BaseEntity } from '../common/base.entity';
import { User } from './user.entity';
import { Submission } from './submission.entity';
import { Review } from './review.entity';
import { ReviewDiscussion } from './review-discussion.entity';

export enum AssignmentStatus {
  INVITED = 'invited',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  COMPLETED = 'completed',
}

@Entity('review_assignments')
@Index('ix_review_assignments_reviewer_assigned', ['reviewerId', 'assignedAt'])
@Index('ix_review_assignments_submission_id', ['submissionId'])
export class ReviewAssignment extends BaseEntity {
  @Column({ type: 'varchar', length: 260, unique: true, nullable: true })
  slug: string | null;

  @Column({ name: 'submission_id' })
  submissionId: string;

  @ManyToOne(() => Submission, (s) => s.reviewAssignments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'submission_id' })
  submission: Submission;

  @Column({ name: 'reviewer_id' })
  reviewerId: string;

  @ManyToOne(() => User, (u) => u.reviewAssignments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reviewer_id' })
  reviewer: User;

  @Column({
    type: 'varchar',
    length: 32,
    default: 'invited',
  })
  status: AssignmentStatus;

  @CreateDateColumn({ name: 'assigned_at' })
  assignedAt: Date;

  /** When the reviewer accepted or declined the invitation. Null while `invited`. */
  @Column({ name: 'responded_at', type: 'timestamptz', nullable: true })
  respondedAt: Date | null;

  @Column({ name: 'response_due_at', type: 'timestamptz', nullable: true })
  responseDueAt: Date | null;

  @Column({ name: 'review_due_at', type: 'timestamptz', nullable: true })
  reviewDueAt: Date | null;

  @Column({ name: 'assigned_by_id', nullable: true })
  assignedById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_by_id' })
  assignedBy: User | null;

  @Column({ name: 'editor_instructions', type: 'text', default: '' })
  editorInstructions: string;

  @OneToOne(() => Review, (r) => r.assignment)
  review: Review | null;

  @OneToMany(() => ReviewDiscussion, (d) => d.assignment)
  discussions: ReviewDiscussion[];
}
