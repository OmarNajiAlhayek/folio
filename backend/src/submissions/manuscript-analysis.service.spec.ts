import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ManuscriptAnalysisService } from './manuscript-analysis.service';
import { Submission } from '../entities/submission.entity';
import { LanguageToolService } from './language-tool.service';
import { AiClientService } from '../ai/ai-client.service';

describe('ManuscriptAnalysisService', () => {
  let service: ManuscriptAnalysisService;
  let submissionsRepo: { findOne: jest.Mock };
  let languageTool: { check: jest.Mock };
  let aiClient: { checkReferences: jest.Mock };

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

    const moduleRef = await Test.createTestingModule({
      providers: [
        ManuscriptAnalysisService,
        { provide: getRepositoryToken(Submission), useValue: submissionsRepo },
        { provide: LanguageToolService, useValue: languageTool },
        { provide: AiClientService, useValue: aiClient },
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
});
