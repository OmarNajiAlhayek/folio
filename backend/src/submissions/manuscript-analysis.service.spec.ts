import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ManuscriptAnalysisService } from './manuscript-analysis.service';
import { Submission } from '../entities/submission.entity';
import { LanguageToolService } from './language-tool.service';
import { AiClientService } from '../ai/ai-client.service';
import { JournalDirectoryService } from '../journals/journal-directory.service';
import { ManuscriptStyleRegistryService } from '../manuscript-styles/manuscript-style-registry.service';
import { damascusUniversityJournalV1 } from '../manuscript-styles/profiles/damascus-university-journal-v1.profile';

describe('ManuscriptAnalysisService', () => {
  let service: ManuscriptAnalysisService;
  let submissionsRepo: { findOne: jest.Mock };
  let languageTool: { check: jest.Mock };
  let aiClient: { checkReferences: jest.Mock };
  let journals: { findJournal: jest.Mock };

  beforeEach(async () => {
    submissionsRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'sub-1',
        constructorContent: {
          defaultDir: 'ltr',
          sections: [
            {
              id: 't1',
              kind: 'title',
              text: 'Title',
              dir: 'ltr',
              dirSource: 'manual',
            },
          ],
        },
        disciplines: ['biology'],
      }),
    };
    languageTool = {
      check: jest
        .fn()
        .mockResolvedValue([
          { excerpt: 'teh', suggestion: 'the', rule: 'SPELL' },
        ]),
    };
    aiClient = {
      checkReferences: jest.fn().mockResolvedValue({
        status: 'ok',
        issues: ['Missing reference for [1]'],
      }),
    };

    journals = { findJournal: jest.fn().mockResolvedValue(null) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ManuscriptAnalysisService,
        { provide: getRepositoryToken(Submission), useValue: submissionsRepo },
        { provide: LanguageToolService, useValue: languageTool },
        { provide: AiClientService, useValue: aiClient },
        { provide: JournalDirectoryService, useValue: journals },
        {
          provide: ManuscriptStyleRegistryService,
          useValue: {
            resolveEffectiveStyleId: () => damascusUniversityJournalV1.id,
            getProfile: () => damascusUniversityJournalV1,
          },
        },
      ],
    }).compile();

    service = moduleRef.get(ManuscriptAnalysisService);
  });

  it('combines structure, grammar, and reference checks', async () => {
    const result = await service.analyzeSubmission('sub-1');
    expect(languageTool.check).toHaveBeenCalled();
    expect(aiClient.checkReferences).toHaveBeenCalled();
    expect(result.grammarNotes).toHaveLength(1);
    expect(result.referenceIssues).toContain('Missing reference for [1]');
    expect(Array.isArray(result.formatIssues)).toBe(true);
  });

  it.each([
    ['العلوم الطبية', 'vancouver'],
    ['العلوم الهندسية', 'apa'],
  ])(
    "checks references with the journal's citation style (%s → %s)",
    async (disciplineLabel, citationStyle) => {
      journals.findJournal.mockResolvedValue({ disciplineLabel });
      await service.analyzeContent(null, {
        disciplines: [],
        journalId: 'journal-1',
      });
      expect(journals.findJournal).toHaveBeenCalledWith('journal-1');
      expect(aiClient.checkReferences).toHaveBeenCalledWith(
        expect.objectContaining({ citationStyle }),
      );
    },
  );

  it('leaves the style to the AI default when the journal is unknown', async () => {
    await service.analyzeContent(null, { disciplines: [], journalId: null });
    expect(journals.findJournal).not.toHaveBeenCalled();
    expect(aiClient.checkReferences).toHaveBeenCalledWith(
      expect.objectContaining({ citationStyle: undefined }),
    );
  });
});
