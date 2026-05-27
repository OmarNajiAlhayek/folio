import {
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Metadata, status as GrpcStatus } from '@grpc/grpc-js';
import type {
  ClassifyArticleResponse,
  SimilarArticleHit,
} from './ai-client.types';
import {
  closeClassifierGrpcClient,
  getClassifierGrpcClient,
} from './grpc-client.factory';
import type { ClassifyResponse } from './grpc/gen/folio/ai/v1/classifier';

@Injectable()
export class AiClientService implements OnModuleDestroy {
  private readonly logger = new Logger(AiClientService.name);
  private loggedHttpDeprecation = false;

  constructor(private readonly config: ConfigService) {}

  onModuleDestroy(): void {
    closeClassifierGrpcClient();
  }

  isEnabled(): boolean {
    if (
      this.config.get<string>('AI_SERVICE_ENABLED', 'false').toLowerCase() !==
      'true'
    ) {
      return false;
    }
    return this.grpcHost() !== '' || this.baseUrl() !== '';
  }

  isSimilarityEnabled(): boolean {
    if (
      this.config.get<string>('AI_SIMILARITY_ENABLED', 'false').toLowerCase() !==
      'true'
    ) {
      return false;
    }
    if (
      this.config.get<string>('AI_SERVICE_ENABLED', 'false').toLowerCase() !==
      'true'
    ) {
      return false;
    }
    return this.httpBaseUrl() !== '';
  }

  private grpcHost(): string {
    return (this.config.get<string>('AI_SERVICE_GRPC_HOST') ?? '').trim();
  }

  private grpcPort(): number {
    const raw = this.config.get<string>('AI_SERVICE_GRPC_PORT', '5246');
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 5246;
  }

  private baseUrl(): string {
    return (this.config.get<string>('AI_SERVICE_URL') ?? '').replace(/\/$/, '');
  }

  /** HTTP base for similarity routes (ai-service HTTP port when only gRPC host is set). */
  private httpBaseUrl(): string {
    const explicit = this.baseUrl();
    if (explicit) {
      return explicit;
    }
    const host = this.grpcHost();
    if (!host) {
      return '';
    }
    const port = this.config.get<string>('AI_SERVICE_HTTP_PORT', '5245');
    return `http://${host}:${port}`;
  }

  private serviceHttpHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const token = this.serviceToken();
    if (token) {
      headers['X-Folio-Service-Token'] = token;
    }
    return headers;
  }

  private serviceToken(): string {
    return this.config.get<string>('AI_SERVICE_TOKEN', '').trim();
  }

  private timeoutMs(): number {
    const raw = this.config.get<string>('AI_SERVICE_TIMEOUT_MS', '120000');
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 120_000;
  }

  private metadata(): Metadata {
    const metadata = new Metadata();
    const token = this.serviceToken();
    if (token) {
      metadata.set('x-folio-service-token', token);
    }
    return metadata;
  }

  private mapClassifyResponse(response: ClassifyResponse): ClassifyArticleResponse {
    return {
      top_label: response.topLabel,
      top_confidence: response.topConfidence,
      probabilities: { ...response.probabilities },
    };
  }

  private logGrpcFailure(code: number, message: string): void {
    if (code === GrpcStatus.UNAUTHENTICATED) {
      this.logger.warn(
        'ai-service ClassifyArticle gRPC UNAUTHENTICATED — check AI_SERVICE_TOKEN matches ai-service',
      );
      return;
    }
    this.logger.warn(
      'ai-service ClassifyArticle gRPC %s: %s',
      GrpcStatus[code] ?? code,
      message.slice(0, 200),
    );
  }

  async classifyArticle(input: {
    title: string;
    keywords: string;
    abstract: string;
  }): Promise<ClassifyArticleResponse | null> {
    if (!this.isEnabled()) {
      return null;
    }
    const host = this.grpcHost();
    if (host) {
      return this.classifyArticleGrpc(host, input);
    }
    return this.classifyArticleHttp(input);
  }

  private classifyArticleGrpc(
    host: string,
    input: { title: string; keywords: string; abstract: string },
  ): Promise<ClassifyArticleResponse | null> {
    const client = getClassifierGrpcClient(host, this.grpcPort());
    const deadline = new Date(Date.now() + this.timeoutMs());

    return new Promise((resolve) => {
      client.classifyArticle(
        {
          title: input.title,
          keywords: input.keywords,
          abstract: input.abstract,
        },
        this.metadata(),
        { deadline },
        (err, response) => {
          if (err) {
            this.logGrpcFailure(err.code, err.message);
            resolve(null);
            return;
          }
          if (!response) {
            resolve(null);
            return;
          }
          resolve(this.mapClassifyResponse(response));
        },
      );
    });
  }

  private async classifyArticleHttp(input: {
    title: string;
    keywords: string;
    abstract: string;
  }): Promise<ClassifyArticleResponse | null> {
    if (!this.loggedHttpDeprecation) {
      this.loggedHttpDeprecation = true;
      this.logger.warn(
        'ai-service classify uses HTTP (AI_SERVICE_URL); prefer AI_SERVICE_GRPC_HOST for production',
      );
    }
    const url = `${this.baseUrl()}/v1/classify/article`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const token = this.serviceToken();
    if (token) {
      headers['X-Folio-Service-Token'] = token;
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: input.title,
          keywords: input.keywords,
          abstract: input.abstract,
        }),
        signal: AbortSignal.timeout(this.timeoutMs()),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.warn(
          'ai-service classify/article returned %s: %s',
          res.status,
          text.slice(0, 200),
        );
        return null;
      }
      return (await res.json()) as ClassifyArticleResponse;
    } catch (err) {
      this.logger.warn(
        'ai-service classify/article failed: %s',
        err instanceof Error ? err.message : String(err),
      );
      return null;
    }
  }

  async upsertSimilarityArticle(input: {
    articleId: string;
    abstract: string;
    keywords: string;
    category: string;
  }): Promise<boolean> {
    if (!this.isSimilarityEnabled()) {
      return false;
    }
    const url = `${this.httpBaseUrl()}/v1/similar/articles`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: this.serviceHttpHeaders(),
        body: JSON.stringify({
          article_id: input.articleId,
          abstract: input.abstract,
          keywords: input.keywords,
          category: input.category,
        }),
        signal: AbortSignal.timeout(this.timeoutMs()),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.warn(
          'ai-service similar/articles returned %s: %s',
          res.status,
          text.slice(0, 200),
        );
        return false;
      }
      return true;
    } catch (err) {
      this.logger.warn(
        'ai-service similar/articles failed: %s',
        err instanceof Error ? err.message : String(err),
      );
      return false;
    }
  }

  async findSimilarArticles(input: {
    articleId: string;
    limit?: number;
  }): Promise<SimilarArticleHit[]> {
    if (!this.isSimilarityEnabled()) {
      return [];
    }
    const url = `${this.httpBaseUrl()}/v1/similar/find`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: this.serviceHttpHeaders(),
        body: JSON.stringify({
          article_id: input.articleId,
          limit: input.limit,
        }),
        signal: AbortSignal.timeout(this.timeoutMs()),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.warn(
          'ai-service similar/find returned %s: %s',
          res.status,
          text.slice(0, 200),
        );
        return [];
      }
      const body = (await res.json()) as { items?: SimilarArticleHit[] };
      return body.items ?? [];
    } catch (err) {
      this.logger.warn(
        'ai-service similar/find failed: %s',
        err instanceof Error ? err.message : String(err),
      );
      return [];
    }
  }
}
