import { ConfigService } from '@nestjs/config';
import { status as GrpcStatus, type ServiceError } from '@grpc/grpc-js';
import { AiClientService } from './ai-client.service';
import {
  closeClassifierGrpcClient,
  getClassifierGrpcClient,
} from './grpc-client.factory';

jest.mock('./grpc-client.factory', () => ({
  getClassifierGrpcClient: jest.fn(),
  closeClassifierGrpcClient: jest.fn(),
}));

describe('AiClientService', () => {
  const mockedGetClient = getClassifierGrpcClient as jest.MockedFunction<
    typeof getClassifierGrpcClient
  >;

  afterEach(() => {
    jest.clearAllMocks();
    closeClassifierGrpcClient();
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

  it('isEnabled with legacy HTTP URL only', () => {
    const service = serviceFromEnv({
      AI_SERVICE_ENABLED: 'true',
      AI_SERVICE_URL: 'http://localhost:5245',
    });
    expect(service.isEnabled()).toBe(true);
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
    mockedGetClient.mockReturnValue({ classifyArticle } as never);

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

  it('soft-fails on gRPC UNAVAILABLE', async () => {
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
    mockedGetClient.mockReturnValue({ classifyArticle } as never);

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
});
