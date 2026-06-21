import fs from 'fs';
import path from 'path';

const filePath = path.join('src', 'submissions', 'submissions.service.ts');
let s = fs.readFileSync(filePath, 'utf8');

if (!s.includes('SubmissionAccessService')) {
  s = s.replace(
    "import { SearchService } from '../search/search.service';",
    `import { SearchService } from '../search/search.service';
import { SubmissionAccessService } from './submission-access.service';
import { PublicationCatalogService } from './publication-catalog.service';
import { SubmissionFileService } from './submission-file.service';
import { SubmissionEventsService } from './submission-events.service';
import { ReviewWorkflowService } from './review-workflow.service';
import {
  DECISION_STATUS_TO_KIND,
  EDITOR_TRANSITIONS,
} from './submission-workflow.constants';`,
  );
}

s = s.replace(
  /const EDITOR_TRANSITIONS:[\s\S]*?const REVIEW_CONFIGURATION_STATUSES:[\s\S]*?\];\n\n/,
  '',
);

if (!s.includes('private readonly access:')) {
  s = s.replace(
    '@Optional() private readonly searchService: SearchService | null = null,\n  ) {}',
    `@Optional() private readonly searchService: SearchService | null = null,
    private readonly access: SubmissionAccessService,
    private readonly catalog: PublicationCatalogService,
    private readonly files: SubmissionFileService,
    private readonly submissionEvents: SubmissionEventsService,
    private readonly reviewWorkflow: ReviewWorkflowService,
  ) {}`,
  );
}

// Global internal renames
const renames = [
  ['this.hasPerm(', 'this.access.hasPerm('],
  ['this.getBySlugOrThrow(', 'this.access.getBySlugOrThrow('],
  ['this.getBySlugForAuthor(', 'this.access.getBySlugForAuthor('],
  ['this.assertCanRead(', 'this.access.assertCanRead('],
  ['this.assertEditorQueueSubmissionVisible(', 'this.access.assertEditorQueueSubmissionVisible('],
  ['this.assertEditorMayConfigureReview(', 'this.access.assertEditorMayConfigureReview('],
  ['this.assertSubmissionAllowsReviewConfiguration(', 'this.access.assertSubmissionAllowsReviewConfiguration('],
  ['this.emitPendingNotifications(', 'this.submissionEvents.emitPendingNotifications('],
  ['this.enqueueSubmissionSubmittedForEditors(', 'this.submissionEvents.enqueueSubmissionSubmittedForEditors('],
  ['this.enqueueSubmissionDecisionEvent(', 'this.submissionEvents.enqueueSubmissionDecisionEvent('],
  ['this.enqueueSubmissionUnderReviewEvent(', 'this.submissionEvents.enqueueSubmissionUnderReviewEvent('],
  ['this.enqueueReviewerInvitedEvent(', 'this.submissionEvents.enqueueReviewerInvitedEvent('],
  ['this.enqueueReviewerResponded(', 'this.submissionEvents.enqueueReviewerResponded('],
  ['this.notifyAllEditors(', 'this.submissionEvents.notifyAllEditors('],
  ['this.enqueueCopyeditAssignedEvent(', 'this.submissionEvents.enqueueCopyeditAssignedEvent('],
  ['this.enqueueCopyeditQueriesSentEvent(', 'this.submissionEvents.enqueueCopyeditQueriesSentEvent('],
  ['this.enqueueCopyeditAuthorReadyEvent(', 'this.submissionEvents.enqueueCopyeditAuthorReadyEvent('],
  ['this.enqueueSubmissionPublishedEvent(', 'this.submissionEvents.enqueueSubmissionPublishedEvent('],
  ['this.uploadRoot()', 'this.files.uploadRoot()'],
  ['this.persistSubmissionFile(', 'this.files.persistSubmissionFile('],
  ['this.replaceSubmissionFilesOfKind(', 'this.files.replaceSubmissionFilesOfKind('],
  ['this.assertHasReviewManuscriptPackage(', 'this.files.assertHasReviewManuscriptPackage('],
];

for (const [from, to] of renames) {
  s = s.split(from).join(to);
}

// Remove private helpers that moved (between markers we'll identify by regex)
const removeBlocks = [
  /  private emitPendingNotifications\([\s\S]*?\n  \}\n\n/,
  /  private hasPerm\([\s\S]*?\n  \}\n\n/,
  /  private viewerRole\([\s\S]*?\n  \}\n\n/,
  /  private async assertHasReviewManuscriptPackage\([\s\S]*?\n  \}\n\n/,
  /  private uploadRoot\(\)[\s\S]*?\n  \}\n\n/,
  /  private ensureUploadDir\(\)[\s\S]*?\n  \}\n\n/,
  /  private async unlinkUploadTemp\([\s\S]*?\n  \}\n\n/,
  /  private assertAuthorMayAddFile\([\s\S]*?\n  \}\n\n/,
  /  private async replaceSubmissionFilesOfKind\([\s\S]*?\n  \}\n\n/,
  /  private async readFileSniffBuffer\([\s\S]*?\n  \}\n\n/,
  /  private async persistSubmissionFile\([\s\S]*?\n  \}\n\n/,
  /  private async nextAssignmentSlug\([\s\S]*?\n  \}\n\n/,
  /  private async allocateAssignmentSlug\([\s\S]*?\n  \}\n\n/,
  /  private assertEditorQueueSubmissionVisible\([\s\S]*?\n  \}\n\n/,
  /  async assertCanRead\([\s\S]*?\n  \}\n\n/,
  /  private assertEditorMayConfigureReview\([\s\S]*?\n  \}\n\n/,
  /  private assertSubmissionAllowsReviewConfiguration\([\s\S]*?\n  \}\n\n/,
  /  private async enqueueReviewerInvitedEvent\([\s\S]*?\n  \}\n\n/,
  /  private async enqueueSubmissionSubmittedForEditors\([\s\S]*?\n  \}\n\n/,
  /  private async enqueueSubmissionDecisionEvent\([\s\S]*?\n  \}\n\n/,
  /  private async enqueueSubmissionUnderReviewEvent\([\s\S]*?\n  \}\n\n/,
  /  private async enqueueReviewerResponded\([\s\S]*?\n  \}\n\n/,
  /  private async notifyAllEditors\([\s\S]*?\n  \}\n\n/,
  /  private assignmentToReviewerListJson\([\s\S]*?\n  \}\n\n/,
  /  private async enqueueCopyeditAssignedEvent\([\s\S]*?\n  \}\n\n/,
  /  private async enqueueCopyeditQueriesSentEvent\([\s\S]*?\n  \}\n\n/,
  /  private async enqueueCopyeditAuthorReadyEvent\([\s\S]*?\n  \}\n\n/,
  /  private async enqueueSubmissionPublishedEvent\([\s\S]*?\n  \}\n\n/,
];

for (const re of removeBlocks) {
  s = s.replace(re, '');
}

// Replace large public method bodies with delegations
const delegations = [
  [
    /  async findPublishedList\([\s\S]*?\n  \}\n\n  async findPublishedAuthorSuggestions/,
    `  async findPublishedList(
    filters: PublicationCatalogFilters = {},
    pagination?: { limit?: number; offset?: number },
  ) {
    return this.catalog.findPublishedList(filters, pagination);
  }

  async findPublishedAuthorSuggestions`,
  ],
  [
    /  async findPublishedAuthorSuggestions\([\s\S]*?\n  \}\n\n  async findPublishedSemanticList/,
    `  async findPublishedAuthorSuggestions(
    q: string,
    limit = PUBLICATION_AUTHOR_SUGGESTION_DEFAULT_LIMIT,
  ) {
    return this.catalog.findPublishedAuthorSuggestions(q, limit);
  }

  async findPublishedSemanticList`,
  ],
  [
    /  async findPublishedSemanticList\([\s\S]*?\n  \}\n\n  async findPublishedOne/,
    `  async findPublishedSemanticList(
    filters: PublicationCatalogFilters,
    limit = 20,
  ) {
    return this.catalog.findPublishedSemanticList(filters, limit);
  }

  async findPublishedOne`,
  ],
  [
    /  async findPublishedOne\([\s\S]*?\n  \}\n\n  \/\*\* Queue async similarity/,
    `  async findPublishedOne(slug: string): Promise<Submission> {
    return this.catalog.findPublishedOne(slug);
  }

  /** Queue async similarity`,
  ],
  [
    /  async enqueuePublishedSubmissionForSimilarity\([\s\S]*?\n  \}\n\n  \/\*\* Queue index jobs/,
    `  async enqueuePublishedSubmissionForSimilarity(submissionId: string): Promise<void> {
    return this.catalog.enqueuePublishedSubmissionForSimilarity(submissionId);
  }

  /** Queue index jobs`,
  ],
  [
    /  async enqueueMissingSimilarityIndexJobs\(\)[\s\S]*?\n  \}\n\n  async findRelatedPublications/,
    `  async enqueueMissingSimilarityIndexJobs(): Promise<number> {
    return this.catalog.enqueueMissingSimilarityIndexJobs();
  }

  async findRelatedPublications`,
  ],
  [
    /  async findRelatedPublications\([\s\S]*?\n  \}\n\n  async getBySlugOrThrow/,
    `  async findRelatedPublications(slug: string, limit = 5) {
    return this.catalog.findRelatedPublications(slug, limit);
  }

  async getBySlugOrThrow`,
  ],
  [
    /  async getBySlugOrThrow\([\s\S]*?\n  \}\n\n  async getBySlugForAuthor/,
    `  async getBySlugOrThrow(slug: string): Promise<Submission> {
    return this.access.getBySlugOrThrow(slug);
  }

  async getBySlugForAuthor`,
  ],
  [
    /  async getBySlugForAuthor\([\s\S]*?\n  \}\n\n  \/\*\* Read the attached/,
    `  async getBySlugForAuthor(slug: string, authorId: string): Promise<Submission | null> {
    return this.access.getBySlugForAuthor(slug, authorId);
  }

  /** Read the attached`,
  ],
  [
    /  async readAttachedConstructorDocxBuffer\([\s\S]*?\n  \}\n\n  private async assertCorpusSimilarityAccess/,
    `  async readAttachedConstructorDocxBuffer(slug: string, user: RequestUser): Promise<Buffer> {
    return this.files.readAttachedConstructorDocxBuffer(slug, user);
  }

  private async assertCorpusSimilarityAccess`,
  ],
  [
    /  async findOneForUser\([\s\S]*?\n  \}\n\n  private async assertCorpusSimilarityAccess/,
    `  async findOneForUser(slug: string, user: RequestUser): Promise<Record<string, unknown>> {
    return this.access.findOneForUser(slug, user);
  }

  private async assertCorpusSimilarityAccess`,
  ],
  [
    /  async updateReviewMethod\([\s\S]*?\n  \}\n\n  async updateSubmissionFileStage/,
    `  async updateReviewMethod(slug: string, user: RequestUser, method: SubmissionReviewMethod) {
    return this.reviewWorkflow.updateReviewMethod(slug, user, method);
  }

  async updateSubmissionFileStage`,
  ],
  [
    /  async updateSubmissionFileStage\([\s\S]*?\n  \}\n\n  async assignReviewer/,
    `  async updateSubmissionFileStage(
    submissionSlug: string,
    fileId: string,
    user: RequestUser,
    stage: SubmissionFileStage,
  ) {
    return this.reviewWorkflow.updateSubmissionFileStage(submissionSlug, fileId, user, stage);
  }

  async assignReviewer`,
  ],
  [
    /  async assignReviewer\([\s\S]*?\n  \}\n\n  \/\*\*\n   \* Build the ReviewerInvitedEvent/,
    `  async assignReviewer(
    submissionSlug: string,
    reviewerId: string,
    editor: RequestUser,
    editorFolioLocale?: string,
    options?: { assignmentSlug?: string; emitReviewerInvited?: boolean },
  ): Promise<ReviewAssignment> {
    return this.reviewWorkflow.assignReviewer(
      submissionSlug,
      reviewerId,
      editor,
      editorFolioLocale,
      options,
    );
  }

  /** @deprecated moved to ReviewWorkflowService — stub for patch script anchor */
  private _assignReviewerMoved(): void {}

  /**
   * Build the ReviewerInvitedEvent`,
  ],
  [
    /  async acceptReviewInvitation\([\s\S]*?\n  \}\n\n  async declineReviewInvitation/,
    `  async acceptReviewInvitation(assignmentSlug: string, reviewerId: string) {
    return this.reviewWorkflow.acceptReviewInvitation(assignmentSlug, reviewerId);
  }

  async declineReviewInvitation`,
  ],
  [
    /  async declineReviewInvitation\([\s\S]*?\n  \}\n\n  async listAssignments/,
    `  async declineReviewInvitation(assignmentSlug: string, reviewerId: string) {
    return this.reviewWorkflow.declineReviewInvitation(assignmentSlug, reviewerId);
  }

  async listAssignments`,
  ],
  [
    /  async listAssignments\([\s\S]*?\n  \}\n\n  async listMyAssignments/,
    `  async listAssignments(submissionSlug: string, user: RequestUser) {
    return this.reviewWorkflow.listAssignments(submissionSlug, user);
  }

  async listMyAssignments`,
  ],
  [
    /  async listMyAssignments\([\s\S]*?\n  \}\n\n  async getMyAssignmentBySlug/,
    `  async listMyAssignments(reviewerId: string) {
    return this.reviewWorkflow.listMyAssignments(reviewerId);
  }

  async getMyAssignmentBySlug`,
  ],
  [
    /  async getMyAssignmentBySlug\([\s\S]*?\n  \}\n\n  async listReviews/,
    `  async getMyAssignmentBySlug(assignmentSlug: string, reviewerId: string) {
    return this.reviewWorkflow.getMyAssignmentBySlug(assignmentSlug, reviewerId);
  }

  async listReviews`,
  ],
  [
    /  async listReviews\([\s\S]*?\n  \}\n\n  async submitReview/,
    `  async listReviews(submissionSlug: string, user: RequestUser) {
    return this.reviewWorkflow.listReviews(submissionSlug, user);
  }

  async submitReview`,
  ],
  [
    /  async submitReview\([\s\S]*?\n  \}\n\n  async addFile/,
    `  async submitReview(
    assignmentSlug: string,
    reviewerId: string,
    commentsForAuthor: string,
    commentsToEditorOnly: string,
    recommendation: ReviewRecommendation,
  ) {
    return this.reviewWorkflow.submitReview(
      assignmentSlug,
      reviewerId,
      commentsForAuthor,
      commentsToEditorOnly,
      recommendation,
    );
  }

  async addFile`,
  ],
  [
    /  async addFile\([\s\S]*?\n  \}\n\n  async getFileForUser/,
    `  async addFile(
    submissionSlug: string,
    user: RequestUser,
    file: Express.Multer.File,
    kindRaw?: string,
  ) {
    return this.files.addFile(submissionSlug, user, file, kindRaw);
  }

  async getFileForUser`,
  ],
  [
    /  async getFileForUser\([\s\S]*?\n  \}\n\n  async deleteFile/,
    `  async getFileForUser(
    submissionSlug: string,
    fileId: string,
    user: RequestUser | null,
  ) {
    return this.files.getFileForUser(submissionSlug, fileId, user);
  }

  async deleteFile`,
  ],
  [
    /  async deleteFile\([\s\S]*?\n  \}\n\n  toPublicSummary/,
    `  async deleteFile(submissionSlug: string, fileId: string, user: RequestUser) {
    return this.files.deleteFile(submissionSlug, fileId, user);
  }

  toPublicSummary`,
  ],
  [
    /  toPublicationListItem\(s: Submission\) \{[\s\S]*?\n  \}\n\n  private async nextCopyeditAssignmentSlug/,
    `  toPublicationListItem(s: Submission) {
    return this.catalog.toPublicationListItem(s);
  }

  private async nextCopyeditAssignmentSlug`,
  ],
];

for (const [re, replacement] of delegations) {
  if (re.test(s)) {
    s = s.replace(re, replacement);
  } else {
    console.warn('delegation pattern not matched');
  }
}

// Remove leftover enqueue stub anchor and orphaned enqueue comment block
s = s.replace(
  /  \/\*\* @deprecated moved to ReviewWorkflowService[\s\S]*?\n  \}\n\n  \/\*\*\n   \* Build the ReviewerInvitedEvent[\s\S]*?private async enqueueReviewerInvitedEvent[\s\S]*?\n  \}\n\n/,
  '',
);

// Fix backfillSlugs to use reviewWorkflow
s = s.replace(
  'a.slug = await this.nextAssignmentSlug(sub.slug);',
  'a.slug = await this.reviewWorkflow.allocateAssignmentSlugForSeed(sub.slug);',
);

// Fix findAllForUser hasPerm
// already renamed via global replace

// Fix viewerRole in remaining code - if any this.viewerRole left, need access
s = s.replace(/this\.viewerRole\(/g, 'this.access.viewerRole(');

fs.writeFileSync(filePath, s);
console.log('patched', s.split('\n').length, 'lines');
