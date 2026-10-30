import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { Repository } from 'typeorm';
import mammoth from 'mammoth';
import { Submission } from '../entities/submission.entity';
import { SubmissionFile } from '../entities/submission-file.entity';
import { resolveUploadRoot } from '../common/upload-root';
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
  MAX_GRAMMAR_TEXT_CHARS,
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
  /** When set, grammar can fall back to the uploaded manuscript file. */
  submissionId?: string;
};

@Injectable()
export class ManuscriptAnalysisService {
  constructor(
    @InjectRepository(Submission)
    private readonly submissionsRepo: Repository<Submission>,
    @InjectRepository(SubmissionFile)
    private readonly filesRepo: Repository<SubmissionFile>,
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
        grammarUnavailable: true,
        referenceIssues: [],
        aiUnavailable: false,
      };
    }
    return this.analyzeContent(submission.constructorContent, {
      disciplines: submission.disciplines ?? [],
      journalId: submission.journalId ?? null,
      submissionId,
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

    const bodyText =
      buildBodyPlainText(content) ||
      (await this.uploadedManuscriptText(context.submissionId));
    const grammar = await this.languageTool.inspect(bodyText);

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

    return {
      formatIssues,
      grammarNotes: grammar.notes,
      grammarUnavailable: grammar.unavailable,
      referenceIssues,
      aiUnavailable,
    };
  }

  /**
   * Word Constructor is off, so most manuscripts exist only as an uploaded
   * file. Grammar still has to read that file.
   */
  private async uploadedManuscriptText(
    submissionId: string | undefined,
  ): Promise<string> {
    if (!submissionId) return '';
    const file = await this.filesRepo.findOne({
      where: { submissionId, kind: 'manuscript' },
      order: { createdAt: 'DESC' },
    });
    const name = file?.originalName?.toLowerCase() ?? '';
    if (!file?.storageKey || !name.endsWith('.docx')) return '';
    try {
      const buffer = await readFile(join(resolveUploadRoot(), file.storageKey));
      const { value } = await mammoth.extractRawText({ buffer });
      return (value ?? '').trim().slice(0, MAX_GRAMMAR_TEXT_CHARS);
    } catch {
      return '';
    }
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
