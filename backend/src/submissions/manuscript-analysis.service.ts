import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Submission } from '../entities/submission.entity';
import { AiClientService } from '../ai/ai-client.service';
import { JournalDirectoryService } from '../journals/journal-directory.service';
import { ManuscriptStyleRegistryService } from '../manuscript-styles/manuscript-style-registry.service';
import {
  resolveCitationStyle,
  type CitationStyle,
} from '../manuscript-styles/citation-style';
import { LanguageToolService } from './language-tool.service';
import type { ManuscriptAnalysisResult } from './pre-submit-analysis.types';
import type { ConstructorContent } from './constructor-content.types';
import {
  buildBodyPlainText,
  checkDamascusStructure,
  damascusCitationStyleIssues,
  damascusDisciplineIssues,
  damascusFormatIssues,
  extractInlineCitations,
  extractReferenceList,
} from './submission-copyedit-text.util';

/** What the analysis needs to know about the submission besides its content. */
export type ManuscriptAnalysisContext = {
  disciplines: string[];
  /** The manuscript's journal decides the citation style (APA / Vancouver). */
  journalId: string | null;
};

@Injectable()
export class ManuscriptAnalysisService {
  constructor(
    @InjectRepository(Submission)
    private readonly submissionsRepo: Repository<Submission>,
    private readonly languageTool: LanguageToolService,
    private readonly aiClient: AiClientService,
    private readonly journals: JournalDirectoryService,
    private readonly manuscriptStyles: ManuscriptStyleRegistryService,
  ) {}

  async analyzeSubmission(
    submissionId: string,
  ): Promise<ManuscriptAnalysisResult> {
    const submission = await this.submissionsRepo.findOne({
      where: { id: submissionId },
      select: ['id', 'constructorContent', 'disciplines', 'journalId'],
    });
    if (!submission) {
      return {
        formatIssues: ['Submission not found'],
        grammarNotes: [],
        referenceIssues: [],
        aiUnavailable: false,
      };
    }
    return this.analyzeContent(submission.constructorContent, {
      disciplines: submission.disciplines ?? [],
      journalId: submission.journalId ?? null,
    });
  }

  async analyzeContent(
    content: ConstructorContent | null,
    context: ManuscriptAnalysisContext,
  ): Promise<ManuscriptAnalysisResult> {
    const citationStyle = await this.citationStyleFor(
      content,
      context.journalId,
    );
    const structureCheck = checkDamascusStructure(content);
    const formatIssues = [
      ...damascusFormatIssues(structureCheck),
      ...damascusDisciplineIssues(context.disciplines, content),
      ...damascusCitationStyleIssues(citationStyle, content),
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
      citationStyle: citationStyle ?? undefined,
    });
    if (refOutcome.status === 'ok') {
      referenceIssues = refOutcome.issues;
    } else {
      aiUnavailable = true;
    }

    return { formatIssues, grammarNotes, referenceIssues, aiUnavailable };
  }

  /** `null` when the journal is unknown — style-specific checks are skipped. */
  private async citationStyleFor(
    content: ConstructorContent | null,
    journalId: string | null,
  ): Promise<CitationStyle | null> {
    const journal = journalId
      ? await this.journals.findJournal(journalId)
      : null;
    if (!journal) return null;
    const profile = this.manuscriptStyles.getProfile(
      this.manuscriptStyles.resolveEffectiveStyleId(content),
    );
    return resolveCitationStyle(profile, journal.disciplineLabel);
  }
}
