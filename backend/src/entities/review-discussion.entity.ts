import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../common/base.entity';
import { ReviewAssignment } from './review-assignment.entity';
import { ReviewDiscussionMessage } from './review-discussion-message.entity';

@Entity('review_discussions')
@Index('ix_review_discussions_assignment', ['assignmentId'])
export class ReviewDiscussion extends BaseEntity {
  @Column({ name: 'assignment_id' })
  assignmentId: string;

  @ManyToOne(() => ReviewAssignment, (a) => a.discussions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'assignment_id' })
  assignment: ReviewAssignment;

  @Column({ type: 'varchar', length: 500, default: '' })
  subject: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => ReviewDiscussionMessage, (m) => m.discussion, {
    cascade: true,
  })
  messages: ReviewDiscussionMessage[];
}
