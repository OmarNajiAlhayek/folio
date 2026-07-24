import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Submission } from '../entities/submission.entity';
import { AiClientService } from '../ai/ai-client.service';
import { LanguageToolService } from './language-tool.service';
import type { ManuscriptAnalysisResult } from './pre-submit-analysis.types';
import type { ConstructorContent } from './constructor-content.types';
import {
  buildBodyPlainText,
  checkDamascusStructure,
  damascusDisciplineIssues,
  damascusFormatIssues,
  extractInlineCitations,
  extractReferenceList,
} from './submission-copyedit-text.util';

@Injectable()
export class ManuscriptAnalysisService {
  constructor(
    @InjectRepository(Submission)
    private readonly submissionsRepo: Repository<Submission>,
    private readonly languageTool: LanguageToolService,
    private readonly aiClient: AiClientService,
  ) {}

  async analyzeSubmission(
    submissionId: string,
  ): Promise<ManuscriptAnalysisResult> {
    const submission = await this.submissionsRepo.findOne({
      where: { id: submissionId },
      select: ['id', 'constructorContent', 'disciplines'],
    });
    if (!submission) {
      return {
        formatIssues: ['Submission not found'],
        grammarNotes: [],
        referenceIssues: [],
        aiUnavailable: false,
      };
    }
    return this.analyzeContent(
      submission.constructorContent,
      submission.disciplines ?? [],
    );
  }

  async analyzeContent(
    content: ConstructorContent | null,
    disciplines: string[],
  ): Promise<ManuscriptAnalysisResult> {
    const structureCheck = checkDamascusStructure(content);
    const formatIssues = [
      ...damascusFormatIssues(structureCheck),
      ...damascusDisciplineIssues(disciplines, content),
    ];

    const bodyText = buildBodyPlainText(content);
    const grammarNotes = await this.languageTool.check(bodyText);

    const referenceList = extractReferenceList(content);
    const inlineCitations = extractInlineCitations(content);
    let referenceIssues: string[] = [];
    let aiUnavailable = false;

    const refOutcome = await this.aiClient.checkReferences({
      referenceList,
      inlineCitations,
    });
    if (refOutcome.status === 'ok') {
      referenceIssues = refOutcome.issues;
    } else {
      aiUnavailable = true;
    }

    return { formatIssues, grammarNotes, referenceIssues, aiUnavailable };
  }
}
