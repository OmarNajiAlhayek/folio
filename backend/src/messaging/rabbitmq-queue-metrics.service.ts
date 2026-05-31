import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RabbitMqConnection } from './rabbitmq.connection';
import { DEFAULT_TOPOLOGY, TopologyNames } from './shared/topology';

export type QueueDepthEntry = {
  messageCount: number;
  consumerCount: number;
};

export type RabbitMqPipelineMetrics = {
  metricsAvailable: true;
  cachedAt: string;
  staleAfterSeconds: number;
  available: boolean;
  error?: string;
  queues: Record<string, QueueDepthEntry>;
};

@Injectable()
export class RabbitMqQueueMetricsService {
  private readonly logger = new Logger(RabbitMqQueueMetricsService.name);
  private readonly ttlMs: number;
  private readonly topology: TopologyNames;
  private cache:
    | {
        expiresAt: number;
        value: RabbitMqPipelineMetrics;
      }
    | undefined;

  constructor(
    config: ConfigService,
    private readonly rabbit: RabbitMqConnection,
  ) {
    this.ttlMs = config.get<number>('EMAIL_QUEUE_METRICS_CACHE_MS', 20_000);
    const exchange = config.get<string>(
      'RABBITMQ_EXCHANGE',
      DEFAULT_TOPOLOGY.exchange,
    );
    this.topology = { ...DEFAULT_TOPOLOGY, exchange };
  }

  /**
   * Returns cached queue depths for DLQ + worker queues. Uses a short TTL
   * so frequent UI refresh does not hammer checkQueue.
   */
  async getCachedMetrics(): Promise<RabbitMqPipelineMetrics> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.value;
    }

    const staleAfterSeconds = Math.max(1, Math.ceil(this.ttlMs / 1000));
    const queueNames = [
      this.topology.dlq,
      this.topology.reviewerInvitedQueue,
      this.topology.reminderDueQueue,
      this.topology.copyeditAssignedQueue,
      this.topology.copyeditQueriesSentQueue,
      this.topology.copyeditAuthorReadyQueue,
      this.topology.submissionSubmittedQueue,
      this.topology.submissionDecisionQueue,
      this.topology.submissionPublishedQueue,
      this.topology.reviewSubmittedQueue,
      this.topology.reviewInvitationAcceptedQueue,
      this.topology.reviewInvitationDeclinedQueue,
      this.topology.roleInvitationQueue,
    ] as const;

    const queues: Record<string, QueueDepthEntry> = {};
    try {
      for (const name of queueNames) {
        const stats = await this.rabbit.getQueueMessageStats(name);
        queues[name] = {
          messageCount: stats.messageCount,
          consumerCount: stats.consumerCount,
        };
      }
      const value: RabbitMqPipelineMetrics = {
        metricsAvailable: true,
        cachedAt: new Date().toISOString(),
        staleAfterSeconds,
        available: true,
        queues,
      };
      this.cache = { expiresAt: now + this.ttlMs, value };
      return value;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`queue metrics fetch failed: ${message}`);
      const value: RabbitMqPipelineMetrics = {
        metricsAvailable: true,
        cachedAt: new Date().toISOString(),
        staleAfterSeconds,
        available: false,
        error: redactMetricsError(message),
        queues,
      };
      // Cache failures briefly so a down broker does not amplify load
      this.cache = {
        expiresAt: now + Math.min(this.ttlMs, 5000),
        value,
      };
      return value;
    }
  }
}

function redactMetricsError(msg: string): string {
  return msg
    .replace(
      /\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}\b/g,
      '[host]',
    )
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '[host]')
    .slice(0, 300);
}
