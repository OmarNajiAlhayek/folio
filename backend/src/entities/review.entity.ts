import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from '../common/base.entity';
import { ReviewAssignment } from './review-assignment.entity';

export enum ReviewRecommendation {
  ACCEPT = 'accept',
  MINOR_REVISIONS = 'minor_revisions',
  MAJOR_REVISIONS = 'major_revisions',
  /** Legacy undifferentiated value; kept so pre-severity rows still validate. */
  REVISIONS = 'revisions',
  RESUBMIT_FOR_REVIEW = 'resubmit_for_review',
  RESUBMIT_ELSEWHERE = 'resubmit_elsewhere',
  REJECT = 'reject',
  SEE_COMMENTS = 'see_comments',
}

@Entity('reviews')
export class Review extends BaseEntity {
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
