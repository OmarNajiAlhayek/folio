import { AiClientService } from './ai-client.service';

export const aiClientServiceMock = {
  provide: AiClientService,
  useValue: {
    isEnabled: jest.fn().mockReturnValue(false),
    isKeywordsEnabled: jest.fn().mockReturnValue(false),
    isSimilarityEnabled: jest.fn().mockReturnValue(false),
    isCorpusSimilarityEnabled: jest.fn().mockReturnValue(false),
    isReviewerMatchingEnabled: jest.fn().mockReturnValue(false),
    suggestReviewers: jest.fn().mockResolvedValue({ status: 'unavailable' }),
    detectCorpusSimilarity: jest.fn().mockResolvedValue(null),
    classifyArticle: jest.fn().mockResolvedValue(null),
    suggestKeywords: jest.fn().mockResolvedValue({ status: 'unavailable' }),
    upsertSimilarityArticle: jest.fn().mockResolvedValue(false),
    findSimilarArticles: jest.fn().mockResolvedValue([]),
    semanticSearchPublications: jest.fn().mockResolvedValue([]),
  },
};
