import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import type { RequestUser } from '../common/types/request-user';
import { SubmissionAccessService } from './submission-access.service';
import { ManuscriptAnalysisService } from './manuscript-analysis.service';
import { hashConstructorContent } from './constructor-content-hash.util';
import type {
  PreSubmitAnalysisData,
  PreSubmitGrammarNote,
} from './pre-submit-analysis.types';
import type { ConstructorContent } from './constructor-content.types';
import { hasMeaningfulConstructorContent } from './constructor-content-utils';
import { sanitizeConstructorContent } from './sanitize-constructor-html';
import type { ReviewManuscriptPresentation } from './review-manuscript-presentation.types';

@Injectable()
export class PreSubmitAnalysisService {
  constructor(
    @InjectRepository(Submission)
    private readonly submissionsRepo: Repository<Submission>,
    private readonly access: SubmissionAccessService,
    private readonly analysis: ManuscriptAnalysisService,
  ) {}

  requiresPreSubmitAnalysis(
    presentation: ReviewManuscriptPresentation,
    content: ConstructorContent | null,
  ): boolean {
    return (
      presentation.presentConstructor &&
      hasMeaningfulConstructorContent(content)
    );
  }

  async runAnalysis(
    slug: string,
    user: RequestUser,
  ): Promise<PreSubmitAnalysisData> {
    const submission = await this.assertAuthorDraft(slug, user);
    const content = sanitizeConstructorContent(submission.constructorContent);
    if (!hasMeaningfulConstructorContent(content)) {
      throw new BadRequestException({
        message: 'Constructor content is required for manuscript validation',
        code: 'CONSTRUCTOR_VALIDATION_FAILED',
        errors: [
          {
            code: 'CONSTRUCTOR_EMPTY',
            message: 'Constructor content is empty',
          },
        ],
      });
    }

    const result = await this.analysis.analyzeContent(
      content,
      submission.disciplines ?? [],
    );
    const contentHash = hashConstructorContent(content);
    if (!contentHash) {
      throw new BadRequestException({
        message: 'Constructor content is required for manuscript validation',
        code: 'CONSTRUCTOR_VALIDATION_FAILED',
      });
    }

    const data: PreSubmitAnalysisData = {
      id: randomUUID(),
      analyzedAt: new Date().toISOString(),
      contentHash,
      formatIssues: result.formatIssues,
      grammarNotes: stripGrammarOffsets(result.grammarNotes),
      referenceIssues: result.referenceIssues,
      aiUnavailable: result.aiUnavailable,
      acknowledged: result.grammarNotes.length === 0,
      acknowledgedAt:
        result.grammarNotes.length === 0 ? new Date().toISOString() : null,
    };

    submission.preSubmitAnalysis = data;
    await this.submissionsRepo.save(submission);
    return data;
  }

  async acknowledge(
    slug: string,
    user: RequestUser,
  ): Promise<PreSubmitAnalysisData> {
    const submission = await this.assertAuthorDraft(slug, user);
    const analysis = submission.preSubmitAnalysis;
    if (!analysis) {
      throw new BadRequestException({
        message:
          'Run manuscript validation before acknowledging language notes',
        code: 'PRE_SUBMIT_ANALYSIS_REQUIRED',
      });
    }

    const content = sanitizeConstructorContent(submission.constructorContent);
    const currentHash = hashConstructorContent(content);
    if (!currentHash || currentHash !== analysis.contentHash) {
      throw new BadRequestException({
        message:
          'Manuscript changed since the last validation; re-run validation first',
        code: 'PRE_SUBMIT_ANALYSIS_STALE',
      });
    }

    if (analysis.grammarNotes.length === 0) {
      return analysis;
    }

    const updated: PreSubmitAnalysisData = {
      ...analysis,
      acknowledged: true,
      acknowledgedAt: new Date().toISOString(),
    };
    submission.preSubmitAnalysis = updated;
    await this.submissionsRepo.save(submission);
    return updated;
  }

  assertReadyForPreSubmit(
    submission: Submission,
    content: ConstructorContent | null,
    presentation: ReviewManuscriptPresentation,
  ): void {
    if (!this.requiresPreSubmitAnalysis(presentation, content)) {
      return;
    }

    const analysis = submission.preSubmitAnalysis;
    if (!analysis) {
      throw new BadRequestException({
        message: 'Run manuscript validation before submitting for review',
        code: 'PRE_SUBMIT_ANALYSIS_REQUIRED',
      });
    }

    const currentHash = hashConstructorContent(content);
    if (!currentHash || currentHash !== analysis.contentHash) {
      throw new BadRequestException({
        message:
          'Manuscript changed since the last validation; re-run validation before submitting',
        code: 'PRE_SUBMIT_ANALYSIS_STALE',
      });
    }

    if (
      analysis.formatIssues.length > 0 ||
      analysis.referenceIssues.length > 0
    ) {
      throw new BadRequestException({
        message:
          'Fix structure, format, or citation issues before submitting for review',
        code: 'PRE_SUBMIT_BLOCKING_ISSUES',
      });
    }
  }

  private async assertAuthorDraft(
    slug: string,
    user: RequestUser,
  ): Promise<Submission> {
    const submission = await this.access.getBySlugOrThrow(slug);
    if (submission.authorId !== user.sub) {
      throw new ForbiddenException({
        message: 'Only the author can validate this submission',
        code: 'FORBIDDEN',
      });
    }
    if (
      submission.status !== SubmissionStatus.DRAFT &&
      submission.status !== SubmissionStatus.REVISIONS_REQUESTED
    ) {
      throw new BadRequestException({
        message: 'Validation is only available for draft submissions',
        code: 'VALIDATION_ERROR',
      });
    }
    return submission;
  }
}

function stripGrammarOffsets(
  notes: Array<{
    excerpt: string;
    suggestion: string;
    rule: string;
    offset?: number;
    length?: number;
  }>,
): PreSubmitGrammarNote[] {
  return notes.map(({ excerpt, suggestion, rule }) => ({
    excerpt,
    suggestion,
    rule,
  }));
}
