import { ConfigService } from '@nestjs/config';
import { status as GrpcStatus, type ServiceError } from '@grpc/grpc-js';
import { AiClientService } from './ai-client.service';
import {
  closeAiGrpcClients,
  getClassifierGrpcClient,
  getSimilarityGrpcClient,
} from './grpc-client.factory';

jest.mock('./grpc-client.factory', () => ({
  getClassifierGrpcClient: jest.fn(),
  getKeywordGrpcClient: jest.fn(),
  getPlagiarismGrpcClient: jest.fn(),
  getSimilarityGrpcClient: jest.fn(),
  closeClassifierGrpcClient: jest.fn(),
  closeKeywordGrpcClient: jest.fn(),
  closePlagiarismGrpcClient: jest.fn(),
  closeSimilarityGrpcClient: jest.fn(),
  closeAiGrpcClients: jest.fn(),
}));

describe('AiClientService', () => {
  const mockedGetClassifier = getClassifierGrpcClient as jest.MockedFunction<
    typeof getClassifierGrpcClient
  >;
  const mockedGetSimilarity = getSimilarityGrpcClient as jest.MockedFunction<
    typeof getSimilarityGrpcClient
  >;

  afterEach(() => {
    jest.clearAllMocks();
    closeAiGrpcClients();
  });

  function serviceFromEnv(env: Record<string, string | undefined>): AiClientService {
    return new AiClientService(new ConfigService(env));
  }

  it('isEnabled when gRPC host is set', () => {
    const service = serviceFromEnv({
      AI_SERVICE_ENABLED: 'true',
      AI_SERVICE_GRPC_HOST: '127.0.0.1',
    });
    expect(service.isEnabled()).toBe(true);
  });

  it('is not enabled without gRPC host', () => {
    const service = serviceFromEnv({
      AI_SERVICE_ENABLED: 'true',
    });
    expect(service.isEnabled()).toBe(false);
  });

  it('isSimilarityEnabled requires gRPC host', () => {
    const enabled = serviceFromEnv({
      AI_SERVICE_ENABLED: 'true',
      AI_SIMILARITY_ENABLED: 'true',
      AI_SERVICE_GRPC_HOST: '127.0.0.1',
    });
    const disabled = serviceFromEnv({
      AI_SERVICE_ENABLED: 'true',
      AI_SIMILARITY_ENABLED: 'true',
    });
    expect(enabled.isSimilarityEnabled()).toBe(true);
    expect(disabled.isSimilarityEnabled()).toBe(false);
  });

  it('returns null from classifyArticle when gRPC host unset', async () => {
    const service = serviceFromEnv({
      AI_SERVICE_ENABLED: 'true',
    });
    await expect(
      service.classifyArticle({
        title: 't',
        keywords: 'k',
        abstract: 'abstract text',
      }),
    ).resolves.toBeNull();
    expect(mockedGetClassifier).not.toHaveBeenCalled();
  });

  it('maps gRPC ClassifyArticle response', async () => {
    const classifyArticle = jest.fn(
      (
        _request: unknown,
        _metadata: unknown,
        _options: unknown,
        callback: (err: ServiceError | null, response?: unknown) => void,
      ) => {
        callback(null, {
          topLabel: 'العلوم الطبية',
          topConfidence: 91.5,
          probabilities: { 'العلوم الطبية': 91.5 },
        });
      },
    );
    mockedGetClassifier.mockReturnValue({ classifyArticle } as never);

    const service = serviceFromEnv({
      AI_SERVICE_ENABLED: 'true',
      AI_SERVICE_GRPC_HOST: '127.0.0.1',
      AI_SERVICE_GRPC_PORT: '5246',
    });

    const result = await service.classifyArticle({
      title: 't',
      keywords: 'k',
      abstract: 'abstract text',
    });

    expect(result).toEqual({
      top_label: 'العلوم الطبية',
      top_confidence: 91.5,
      probabilities: { 'العلوم الطبية': 91.5 },
    });
    expect(classifyArticle).toHaveBeenCalled();
  });

  it('soft-fails classifyArticle on gRPC UNAVAILABLE', async () => {
    const classifyArticle = jest.fn(
      (
        _request: unknown,
        _metadata: unknown,
        _options: unknown,
        callback: (err: ServiceError | null) => void,
      ) => {
        callback({
          code: GrpcStatus.UNAVAILABLE,
          message: 'connection refused',
        } as ServiceError);
      },
    );
    mockedGetClassifier.mockReturnValue({ classifyArticle } as never);

    const service = serviceFromEnv({
      AI_SERVICE_ENABLED: 'true',
      AI_SERVICE_GRPC_HOST: '127.0.0.1',
    });

    await expect(
      service.classifyArticle({
        title: '',
        keywords: '',
        abstract: 'text',
      }),
    ).resolves.toBeNull();
  });

  it('maps gRPC upsertSimilarityArticle to true', async () => {
    const upsertArticle = jest.fn(
      (
        _request: unknown,
        _metadata: unknown,
        _options: unknown,
        callback: (err: ServiceError | null) => void,
      ) => {
        callback(null);
      },
    );
    mockedGetSimilarity.mockReturnValue({ upsertArticle } as never);

    const service = serviceFromEnv({
      AI_SERVICE_ENABLED: 'true',
      AI_SIMILARITY_ENABLED: 'true',
      AI_SERVICE_GRPC_HOST: '127.0.0.1',
    });

    await expect(
      service.upsertSimilarityArticle({
        articleId: 'id-1',
        abstract: 'abstract',
        keywords: 'kw',
        category: 'cat',
      }),
    ).resolves.toBe(true);
  });

  it('soft-fails findSimilarArticles on gRPC error', async () => {
    const findSimilarArticles = jest.fn(
      (
        _request: unknown,
        _metadata: unknown,
        _options: unknown,
        callback: (err: ServiceError | null) => void,
      ) => {
        callback({
          code: GrpcStatus.UNAVAILABLE,
          message: 'down',
        } as ServiceError);
      },
    );
    mockedGetSimilarity.mockReturnValue({ findSimilarArticles } as never);

    const service = serviceFromEnv({
      AI_SERVICE_ENABLED: 'true',
      AI_SIMILARITY_ENABLED: 'true',
      AI_SERVICE_GRPC_HOST: '127.0.0.1',
    });

    await expect(
      service.findSimilarArticles({ articleId: 'id-1' }),
    ).resolves.toEqual([]);
  });

  it('maps gRPC semanticSearchPublications hits', async () => {
    const semanticSearch = jest.fn(
      (
        _request: unknown,
        _metadata: unknown,
        _options: unknown,
        callback: (err: ServiceError | null, response?: unknown) => void,
      ) => {
        callback(null, {
          hits: [
            {
              articleId: 'pub-1',
              snippet: 'snippet text',
              score: 0.9,
            },
          ],
        });
      },
    );
    mockedGetSimilarity.mockReturnValue({ semanticSearch } as never);

    const service = serviceFromEnv({
      AI_SERVICE_ENABLED: 'true',
      AI_SIMILARITY_ENABLED: 'true',
      AI_SERVICE_GRPC_HOST: '127.0.0.1',
    });

    await expect(
      service.semanticSearchPublications({ query: 'machine learning' }),
    ).resolves.toEqual([
      {
        article_id: 'pub-1',
        snippet: 'snippet text',
        score: 0.9,
      },
    ]);
  });
});
