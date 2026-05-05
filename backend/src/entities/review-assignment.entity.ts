import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Submission } from './submission.entity';
import { Review } from './review.entity';

export enum AssignmentStatus {
  INVITED = 'invited',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  COMPLETED = 'completed',
}

@Entity('review_assignments')
export class ReviewAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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

  @OneToOne(() => Review, (r) => r.assignment)
  review: Review | null;
}
