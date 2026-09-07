import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  UpdateDateColumn,
} from 'typeorm';
import { BaseEntity } from '../common/base.entity';
import { User } from './user.entity';
import { Journal } from './journal.entity';
import { JournalIssue } from './journal-issue.entity';
import { SubmissionStatus } from './submission-status.enum';
import { SubmissionArticleType } from './submission-article-type.enum';
import { SubmissionReviewMethod } from './submission-review-method.enum';
import { SubmissionDisciplineSource } from './submission-discipline-source.enum';
import type { DisciplineClassificationJson } from '../ai/ai-client.types';
import { SubmissionFile } from './submission-file.entity';
import { ReviewAssignment } from './review-assignment.entity';
import { CopyeditAssignment } from './copyedit-assignment.entity';
import { SectionEditorAssignment } from './section-editor-assignment.entity';
import type { SubmissionContributorJson } from '../submissions/submission-json.types';
import type { ConstructorContent } from '../submissions/constructor-content.types';
import type { ReviewManuscriptPresentation } from '../submissions/review-manuscript-presentation.types';
import type { PreSubmitAnalysisData } from '../submissions/pre-submit-analysis.types';
import type { RevisionSeverity } from '../submissions/submission-workflow.constants';

@Entity('submissions')
@Index('ix_submissions_status_updated_at', ['status', 'updatedAt'])
@Index('ix_submissions_author_updated_at', ['authorId', 'updatedAt'])
@Index('ix_submissions_status_published_at', ['status', 'publishedAt'])
@Index('ix_submissions_editor_queue', ['updatedAt'], {
  where: `"status" <> 'draft'`,
})
// Journal-scoped editor queue: an editor of one journal filters by journal_id
// first, so the composite beats the status-only index above for that path.
@Index('ix_submissions_journal_status_updated_at', [
  'journalId',
  'status',
  'updatedAt',
])
@Index('ix_submissions_issue_published_at', ['issueId', 'publishedAt'])
export class Submission extends BaseEntity {
  @Column({ name: 'author_id' })
  authorId: string;

  @ManyToOne(() => User, (u) => u.submissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  author: User;

  /**
   * The journal this manuscript belongs to — chosen by the author at
   * submission and required since slice 6 (`SubmissionJournalRequired`).
   * Every manuscript has an editorial home, so the editor queue, the issue it
   * is published into and the portal all have exactly one journal to key on.
   */
  @Column({ name: 'journal_id', type: 'uuid' })
  journalId: string;

  @ManyToOne(() => Journal, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'journal_id' })
  journal: Journal;

  /**
   * Issue (العدد) the article is placed in. Null until publish; publishing
   * without an issue is invalid. Always inside {@link journalId}'s journal.
   */
  @Column({ name: 'issue_id', type: 'uuid', nullable: true })
  issueId: string | null;

  @ManyToOne(() => JournalIssue, (i) => i.articles, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'issue_id' })
  issue: JournalIssue | null;

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

  /** Confirmed academic fields (Arabic labels from AraBERT taxonomy, max 3). */
  @Column({ type: 'text', array: true, default: [] })
  disciplines: string[];

  @Column({
    name: 'discipline_source',
    type: 'enum',
    enum: SubmissionDisciplineSource,
    nullable: true,
  })
  disciplineSource: SubmissionDisciplineSource | null;

  @Column({
    name: 'discipline_suggested_labels',
    type: 'text',
    array: true,
    default: [],
  })
  disciplineSuggestedLabels: string[];

  @Column({
    name: 'discipline_suggested_confidence',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  disciplineSuggestedConfidence: string | null;

  @Column({ name: 'discipline_classification', type: 'jsonb', nullable: true })
  disciplineClassification: DisciplineClassificationJson | null;

  /**
   * Word-Constructor structured content. Non-null implies the submission
   * is in "constructor mode" (vs upload mode). See docs/plans/word-constructor.md.
   */
  @Column({ name: 'constructor_content', type: 'jsonb', nullable: true })
  constructorContent: ConstructorContent | null;

  /**
   * Set on submit: which main manuscript sources are placed in the review package
   * (uploaded file and/or constructor-generated .docx).
   */
  @Column({
    name: 'review_manuscript_presentation',
    type: 'jsonb',
    nullable: true,
  })
  reviewManuscriptPresentation: ReviewManuscriptPresentation | null;

  /** Author pre-submit validation snapshot (structure, grammar, citations). */
  @Column({ name: 'pre_submit_analysis', type: 'jsonb', nullable: true })
  preSubmitAnalysis: PreSubmitAnalysisData | null;

  /**
   * Format violations found in the uploaded manuscript Word file.
   * Null = not checked yet (no .docx manuscript uploaded).
   * Empty array = file passed all format checks.
   */
  @Column({ name: 'docx_manuscript_violations', type: 'jsonb', nullable: true })
  docxManuscriptViolations:
    | import('../submissions/docx-format-checker').DocxFormatViolation[]
    | null;

  /**
   * Grammar/spelling notes from LanguageTool on the uploaded manuscript Word file.
   * Null = not checked yet. Empty array = no issues found.
   * Advisory only — does not block submission.
   */
  @Column({ name: 'docx_grammar_notes', type: 'jsonb', nullable: true })
  docxGrammarNotes:
    | import('@folio/shared/contracts/pre-submit-analysis').PreSubmitGrammarNote[]
    | null;

  @Column({
    type: 'enum',
    enum: SubmissionStatus,
    default: SubmissionStatus.DRAFT,
  })
  status: SubmissionStatus;

  /** Optional rationale from the editor on accept/reject/revisions_requested. */
  @Column({ name: 'message_for_author', type: 'text', nullable: true })
  messageForAuthor: string | null;

  /**
   * Fine-grained decision audit trail: distinguishes a desk rejection
   * (submitted → rejected, before review) from a post-review rejection
   * (under_review → rejected). Null until the first editor decision.
   */
  @Column({
    name: 'last_decision_kind',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  lastDecisionKind:
    | 'desk_reject'
    | 'post_review_reject'
    | 'accepted'
    | 'revisions_requested'
    | null;

  /**
   * Severity of the current `revisions_requested` decision. Null in every other
   * status; cleared when the submission is accepted or rejected.
   */
  @Column({
    name: 'revision_severity',
    type: 'varchar',
    length: 10,
    nullable: true,
  })
  revisionSeverity: RevisionSeverity | null;

  /**
   * How many revision rounds this submission has been through. 0 until the first
   * `revisions_requested`. Kept as history after accept/reject, and threaded into
   * the decision/submitted idempotency keys so round N+1 is not deduped against N.
   */
  @Column({ name: 'revision_round', type: 'int', default: 0 })
  revisionRound: number;

  /** Author's reply to reviewer/editor feedback, set on resubmission after revisions_requested. */
  @Column({
    name: 'author_response_to_reviewers',
    type: 'text',
    nullable: true,
  })
  authorResponseToReviewers: string | null;

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

  /** Set when the article is indexed in the ai-service similarity corpus. */
  @Column({
    name: 'similarity_indexed_at',
    type: 'timestamptz',
    nullable: true,
  })
  similarityIndexedAt: Date | null;

  /** Maintained by DB trigger `trg_submissions_publication_search`; not loaded by TypeORM. */
  @Column({
    name: 'publication_search_document',
    type: 'text',
    nullable: true,
    insert: false,
    update: false,
    select: false,
  })
  publicationSearchDocument?: string | null;

  /** Maintained by DB trigger; queried via raw SQL in catalog search only. */
  @Column({
    name: 'publication_search_vector',
    type: 'tsvector',
    nullable: true,
    insert: false,
    update: false,
    select: false,
  })
  publicationSearchVector?: string | null;

  @OneToMany(() => SubmissionFile, (f) => f.submission)
  files: SubmissionFile[];

  @OneToMany(() => ReviewAssignment, (a) => a.submission)
  reviewAssignments: ReviewAssignment[];

  @OneToMany(() => CopyeditAssignment, (a) => a.submission)
  copyeditAssignments: CopyeditAssignment[];

  @OneToOne(() => SectionEditorAssignment, (a) => a.submission, {
    nullable: true,
  })
  sectionEditorAssignment: SectionEditorAssignment | null;
}
