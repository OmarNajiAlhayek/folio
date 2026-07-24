import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { BaseEntity } from '../common/base.entity';
import { ReviewDiscussion } from './review-discussion.entity';
import { User } from './user.entity';

@Entity('review_discussion_messages')
@Index('ix_rdm_discussion_created', ['discussionId', 'createdAt'])
export class ReviewDiscussionMessage extends BaseEntity {
  @Column({ name: 'discussion_id' })
  discussionId: string;

  @ManyToOne(() => ReviewDiscussion, (d) => d.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'discussion_id' })
  discussion: ReviewDiscussion;

  @Column({ name: 'author_id' })
  authorId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  author: User;

  @Column({ type: 'text', default: '' })
  body: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
