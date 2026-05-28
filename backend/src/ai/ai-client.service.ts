import {
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Metadata, status as GrpcStatus } from '@grpc/grpc-js';
import type {
  ClassifyArticleResponse,
  CorpusSimilarityMatch,
  SemanticSearchHit,
  SimilarArticleHit,
  SuggestKeywordsInput,
  SuggestKeywordsOutcome,
  SuggestKeywordsResponse,
  SuggestReviewersInput,
  SuggestReviewersOutcome,
  ReviewerSuggestionHit,
} from './ai-client.types';
import {
  closeAiGrpcClients,
  getClassifierGrpcClient,
  getKeywordGrpcClient,
  getPlagiarismGrpcClient,
  getReviewerMatchingGrpcClient,
  getSimilarityGrpcClient,
} from './grpc-client.factory';
import type { ClassifyResponse } from './grpc/gen/folio/ai/v1/classifier';

@Injectable()
export class AiClientService implements OnModuleDestroy {
  private readonly logger = new Logger(AiClientService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleDestroy(): void {
    closeAiGrpcClients();
  }

  isEnabled(): boolean {
    if (
      this.config.get<string>('AI_SERVICE_ENABLED', 'false').toLowerCase() !==
      'true'
    ) {
      return false;
    }
    return this.grpcHost() !== '';
  }

  isSimilarityEnabled(): boolean {
    return this.isAiSimilarityFeatureEnabled();
  }

  isKeywordsEnabled(): boolean {
    if (
      this.config.get<string>('AI_KEYWORDS_ENABLED', 'false').toLowerCase() !==
      'true'
    ) {
      return false;
    }
    return this.isEnabled();
  }

  isCorpusSimilarityEnabled(): boolean {
    return this.isAiSimilarityFeatureEnabled();
  }

  isReviewerMatchingEnabled(): boolean {
    if (
      this.config
        .get<string>('AI_REVIEWER_MATCHING_ENABLED', 'false')
        .toLowerCase() !== 'true'
    ) {
      return false;
    }
    return this.isEnabled();
  }

  private isAiSimilarityFeatureEnabled(): boolean {
    if (
      this.config.get<string>('AI_SIMILARITY_ENABLED', 'false').toLowerCase() !==
      'true'
    ) {
      return false;
    }
    return this.isEnabled();
  }

  private grpcHost(): string {
    return (this.config.get<string>('AI_SERVICE_GRPC_HOST') ?? '').trim();
  }

  private grpcPort(): number {
    const raw = this.config.get<string>('AI_SERVICE_GRPC_PORT', '5246');
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 5246;
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

  private logGrpcFailure(
    rpc: string,
    code: number,
    message: string,
  ): void {
    if (code === GrpcStatus.UNAUTHENTICATED) {
      this.logger.warn(
        'ai-service %s gRPC UNAUTHENTICATED — check AI_SERVICE_TOKEN matches ai-service',
        rpc,
      );
      return;
    }
    this.logger.warn(
      'ai-service %s gRPC %s: %s',
      rpc,
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
    if (!host) {
      return null;
    }
    return this.classifyArticleGrpc(host, input);
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
            this.logGrpcFailure('ClassifyArticle', err.code, err.message);
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

  async upsertSimilarityArticle(input: {
    articleId: string;
    abstract: string;
    keywords: string;
    category: string;
    fullText?: string;
  }): Promise<boolean> {
    if (!this.isSimilarityEnabled()) {
      return false;
    }
    const host = this.grpcHost();
    if (!host) {
      return false;
    }
    const client = getSimilarityGrpcClient(host, this.grpcPort());
    const deadline = new Date(Date.now() + this.timeoutMs());

    return new Promise((resolve) => {
      client.upsertArticle(
        {
          articleId: input.articleId,
          abstract: input.abstract,
          keywords: input.keywords,
          category: input.category,
          fullText: input.fullText ?? '',
        },
        this.metadata(),
        { deadline },
        (err) => {
          if (err) {
            this.logGrpcFailure('UpsertArticle', err.code, err.message);
            resolve(false);
            return;
          }
          resolve(true);
        },
      );
    });
  }

  async semanticSearchPublications(input: {
    query: string;
    limit?: number;
  }): Promise<SemanticSearchHit[]> {
    if (!this.isSimilarityEnabled()) {
      return [];
    }
    const q = input.query.trim();
    if (!q) {
      return [];
    }
    const host = this.grpcHost();
    if (!host) {
      return [];
    }
    const client = getSimilarityGrpcClient(host, this.grpcPort());
    const deadline = new Date(Date.now() + this.timeoutMs());

    return new Promise((resolve) => {
      client.semanticSearch(
        {
          query: q,
          limit: input.limit,
        },
        this.metadata(),
        { deadline },
        (err, response) => {
          if (err) {
            this.logGrpcFailure('SemanticSearch', err.code, err.message);
            resolve([]);
            return;
          }
          resolve(
            (response?.hits ?? []).map((h) => ({
              article_id: h.articleId,
              snippet: h.snippet,
              score: h.score,
            })),
          );
        },
      );
    });
  }

  async findSimilarArticles(input: {
    articleId: string;
    limit?: number;
  }): Promise<SimilarArticleHit[]> {
    if (!this.isSimilarityEnabled()) {
      return [];
    }
    const host = this.grpcHost();
    if (!host) {
      return [];
    }
    const client = getSimilarityGrpcClient(host, this.grpcPort());
    const deadline = new Date(Date.now() + this.timeoutMs());

    return new Promise((resolve) => {
      client.findSimilarArticles(
        {
          articleId: input.articleId,
          limit: input.limit,
        },
        this.metadata(),
        { deadline },
        (err, response) => {
          if (err) {
            this.logGrpcFailure('FindSimilarArticles', err.code, err.message);
            resolve([]);
            return;
          }
          resolve(
            (response?.hits ?? []).map((h) => ({
              article_id: h.articleId,
              abstract: h.abstract,
              keywords: h.keywords,
              category: h.category,
              similarity: h.similarity,
            })),
          );
        },
      );
    });
  }

  async detectCorpusSimilarity(input: {
    submissionText: string;
    threshold?: number;
    category?: string;
  }): Promise<CorpusSimilarityMatch[] | null> {
    if (!this.isCorpusSimilarityEnabled()) {
      return null;
    }
    const host = this.grpcHost();
    if (!host) {
      return null;
    }
    const client = getPlagiarismGrpcClient(host, this.grpcPort());
    const deadline = new Date(Date.now() + this.timeoutMs());

    return new Promise((resolve) => {
      client.detectCorpusSimilarity(
        {
          submissionText: input.submissionText,
          threshold: input.threshold,
          category: input.category,
        },
        this.metadata(),
        { deadline },
        (err, response) => {
          if (err) {
            this.logGrpcFailure('DetectCorpusSimilarity', err.code, err.message);
            resolve(null);
            return;
          }
          if (!response) {
            resolve(null);
            return;
          }
          resolve(
            (response.matches ?? []).map((m) => ({
              submissionChunkIndex: m.submissionChunkIndex,
              submissionSnippet: m.submissionSnippet,
              sourceArticleId: m.sourceArticleId,
              sourceChunkIndex: m.sourceChunkIndex,
              matchedSnippet: m.matchedSnippet,
              similarity: m.similarity,
            })),
          );
        },
      );
    });
  }

  async suggestKeywords(
    input: SuggestKeywordsInput,
  ): Promise<SuggestKeywordsOutcome> {
    if (!this.isKeywordsEnabled()) {
      return { status: 'unavailable' };
    }
    const host = this.grpcHost();
    if (!host) {
      return { status: 'unavailable' };
    }
    return this.suggestKeywordsGrpc(host, input);
  }

  private suggestKeywordsGrpc(
    host: string,
    input: SuggestKeywordsInput,
  ): Promise<SuggestKeywordsOutcome> {
    const client = getKeywordGrpcClient(host, this.grpcPort());
    const deadline = new Date(Date.now() + this.timeoutMs());

    return new Promise((resolve) => {
      client.suggestKeywords(
        {
          title: input.title?.trim() ?? '',
          abstract: input.abstract?.trim() ?? '',
          titleAr: input.titleAr?.trim() ?? '',
          abstractAr: input.abstractAr?.trim() ?? '',
        },
        this.metadata(),
        { deadline },
        (err, response) => {
          if (err) {
            this.logGrpcFailure('SuggestKeywords', err.code, err.message);
            if (
              err.code === GrpcStatus.FAILED_PRECONDITION ||
              err.code === GrpcStatus.UNAVAILABLE
            ) {
              resolve({ status: 'unavailable' });
              return;
            }
            resolve({ status: 'failed' });
            return;
          }
          if (!response) {
            resolve({ status: 'failed' });
            return;
          }
          resolve({
            status: 'ok',
            data: {
              keywords_en: [...(response.keywordsEn ?? [])],
              keywords_ar: [...(response.keywordsAr ?? [])],
            },
          });
        },
      );
    });
  }

  async suggestReviewers(
    input: SuggestReviewersInput,
  ): Promise<SuggestReviewersOutcome> {
    if (!this.isReviewerMatchingEnabled()) {
      return { status: 'unavailable' };
    }
    const host = this.grpcHost();
    if (!host) {
      return { status: 'unavailable' };
    }
    return this.suggestReviewersGrpc(host, input);
  }

  private suggestReviewersGrpc(
    host: string,
    input: SuggestReviewersInput,
  ): Promise<SuggestReviewersOutcome> {
    const client = getReviewerMatchingGrpcClient(host, this.grpcPort());
    const deadline = new Date(Date.now() + this.timeoutMs());

    return new Promise((resolve) => {
      client.suggestReviewers(
        {
          queryText: input.queryText.trim(),
          limit: input.limit,
          candidateIds: input.candidateIds ?? [],
          excludeReviewerIds: input.excludeReviewerIds ?? [],
          indexProfiles: (input.indexProfiles ?? []).map((p) => ({
            reviewerId: p.reviewerId,
            affiliation: p.affiliation ?? '',
            reviewKeywords: p.reviewKeywords ?? '',
            displayName: p.displayName ?? '',
          })),
          indexHistory: (input.indexHistory ?? []).map((h) => ({
            reviewerId: h.reviewerId,
            submissionId: h.submissionId,
            abstract: h.abstract,
            keywords: h.keywords,
          })),
          useCrossEncoder: input.useCrossEncoder,
        },
        this.metadata(),
        { deadline },
        (err, response) => {
          if (err) {
            this.logGrpcFailure('SuggestReviewers', err.code, err.message);
            if (
              err.code === GrpcStatus.FAILED_PRECONDITION ||
              err.code === GrpcStatus.UNAVAILABLE
            ) {
              resolve({ status: 'unavailable' });
              return;
            }
            resolve({ status: 'failed' });
            return;
          }
          if (!response) {
            resolve({ status: 'failed' });
            return;
          }
          const hits: ReviewerSuggestionHit[] = (response.hits ?? []).map(
            (h) => ({
              reviewer_id: h.reviewerId,
              final_score: h.finalScore,
              bio_score: h.bioScore,
              history_score: h.historyScore,
              ce_bio_score: h.ceBioScore,
              ce_history_score: h.ceHistoryScore,
              used_cross_encoder: h.usedCrossEncoder,
            }),
          );
          resolve({ status: 'ok', hits });
        },
      );
    });
  }
}
