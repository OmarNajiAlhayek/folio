/**
 * AI job events published by the Nest backend through the transactional
 * outbox and consumed by the backend AI jobs worker (RabbitMQ).
 *
 * Routing keys on topic exchange `folio.events`:
 *   ai.similarity_index.requested   -> SimilarityIndexRequestedEvent
 *   ai.corpus_similarity.requested  -> CorpusSimilarityRequestedEvent
 */

export const AI_ROUTING_KEY = {
  similarityIndexRequested: 'ai.similarity_index.requested',
  corpusSimilarityRequested: 'ai.corpus_similarity.requested',
} as const;

export type AiJobEventType =
  | 'SimilarityIndexRequested'
  | 'CorpusSimilarityRequested';

export type SimilarityIndexRequestedEvent = {
  type: 'SimilarityIndexRequested';
  jobId: string;
  idempotencyKey: string;
  submissionId: string;
};

export type CorpusSimilarityRequestedEvent = {
  type: 'CorpusSimilarityRequested';
  jobId: string;
  idempotencyKey: string;
  submissionId: string;
  submissionSlug: string;
  requestedByUserId: string;
};

export type AiJobEvent =
  | SimilarityIndexRequestedEvent
  | CorpusSimilarityRequestedEvent;
