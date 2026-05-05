import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ReviewAssignment } from './review-assignment.entity';

export enum ReviewRecommendation {
  ACCEPT = 'accept',
  REJECT = 'reject',
  REVISIONS = 'revisions',
}

@Entity('reviews')
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'assignment_id', unique: true })
  assignmentId: string;

  @OneToOne(() => ReviewAssignment, (a) => a.review, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assignment_id' })
  assignment: ReviewAssignment;

  @Column({ name: 'comments_for_author', type: 'text', default: '' })
  commentsForAuthor: string;

  @Column({ name: 'comments_to_editor_only', type: 'text', default: '' })
  commentsToEditorOnly: string;

  @Column({
    type: 'enum',
    enum: ReviewRecommendation,
  })
  recommendation: ReviewRecommendation;

  @Column({ name: 'submitted_at', type: 'timestamptz' })
  submittedAt: Date;
}
