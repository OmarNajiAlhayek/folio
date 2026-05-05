import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { SubmissionStatus } from './submission-status.enum';
import { SubmissionArticleType } from './submission-article-type.enum';
import { SubmissionReviewMethod } from './submission-review-method.enum';
import { SubmissionFile } from './submission-file.entity';
import { ReviewAssignment } from './review-assignment.entity';
import type { SubmissionContributorJson } from '../submissions/submission-json.types';
import type { ConstructorContent } from '../submissions/constructor-content.types';

@Entity('submissions')
export class Submission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'author_id' })
  authorId: string;

  @ManyToOne(() => User, (u) => u.submissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  author: User;

  @Column({ type: 'varchar', length: 220, unique: true, nullable: true })
  slug: string | null;

  @Column()
  title: string;

  @Column({ name: 'title_ar', type: 'varchar', length: 500, nullable: true })
  titleAr: string | null;

  @Column({ type: 'text' })
  abstract: string;

  /** Arabic abstract (journal requires Arabic + English abstracts). */
  @Column({ name: 'abstract_ar', type: 'text', nullable: true })
  abstractAr: string | null;

  @Column({
    name: 'article_type',
    type: 'enum',
    enum: SubmissionArticleType,
    nullable: true,
  })
  articleType: SubmissionArticleType | null;

  /** Comma- or semicolon-separated; validated on submit (typically 3–6 keywords). */
  @Column({ type: 'varchar', length: 800, nullable: true })
  keywords: string | null;

  /** Arabic keywords; same 3–6 rule on submit as `keywords`. */
  @Column({ name: 'keywords_ar', type: 'varchar', length: 800, nullable: true })
  keywordsAr: string | null;

  @Column({ type: 'jsonb', nullable: true })
  contributors: SubmissionContributorJson[] | null;

  @Column({ name: 'funding_statement', type: 'text', nullable: true })
  fundingStatement: string | null;

  @Column({
    name: 'conflict_of_interest_statement',
    type: 'text',
    nullable: true,
  })
  conflictOfInterestStatement: string | null;

  @Column({
    name: 'ethical_approval_reference',
    type: 'text',
    nullable: true,
  })
  ethicalApprovalReference: string | null;

  @Column({ name: 'originality_confirmed', default: false })
  originalityConfirmed: boolean;

  @Column({ name: 'ai_usage_statement', type: 'text', nullable: true })
  aiUsageStatement: string | null;

  /**
   * Word-Constructor structured content. Non-null implies the submission
   * is in "constructor mode" (vs upload mode). See docs/plans/word-constructor.md.
   */
  @Column({ name: 'constructor_content', type: 'jsonb', nullable: true })
  constructorContent: ConstructorContent | null;

  @Column({
    type: 'enum',
    enum: SubmissionStatus,
    default: SubmissionStatus.DRAFT,
  })
  status: SubmissionStatus;

  /**
   * Peer review visibility model (OJS: open / single-anonymous / double-anonymous).
   */
  @Column({
    name: 'review_method',
    type: 'enum',
    enum: SubmissionReviewMethod,
    default: SubmissionReviewMethod.DOUBLE_ANONYMOUS,
  })
  reviewMethod: SubmissionReviewMethod;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @OneToMany(() => SubmissionFile, (f) => f.submission)
  files: SubmissionFile[];

  @OneToMany(() => ReviewAssignment, (a) => a.submission)
  reviewAssignments: ReviewAssignment[];
}
