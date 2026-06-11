import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ConsumeMessage } from 'amqplib';
import { AiJobsProcessor } from './ai-jobs.processor';
import { AiJobsRabbitMqConnection } from './ai-jobs-rabbitmq.connection';
import { AiJobsService } from './ai-jobs.service';
import {
  AI_ROUTING_KEY,
  type AiJobEvent,
} from '../messaging/contracts/ai-events';

@Injectable()
export class AiJobsConsumerService implements OnModuleInit {
  private readonly logger = new Logger(AiJobsConsumerService.name);
  private readonly enabled: boolean;

  constructor(
    config: ConfigService,
    private readonly rabbit: AiJobsRabbitMqConnection,
    private readonly processor: AiJobsProcessor,
    private readonly jobsService: AiJobsService,
  ) {
    this.enabled =
      config.get<string>('AI_JOBS_CONSUMER_ENABLED', 'true').trim() !== 'false';
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.log(
        'AI jobs consumer disabled (AI_JOBS_CONSUMER_ENABLED=false)',
      );
      return;
    }

    const topology = this.rabbit.getTopology();
    await this.rabbit.connect();
    await this.rabbit.consume(topology.aiSimilarityIndexQueue, (msg) =>
      this.dispatch(msg, AI_ROUTING_KEY.similarityIndexRequested),
    );
    await this.rabbit.consume(topology.aiCorpusSimilarityQueue, (msg) =>
      this.dispatch(msg, AI_ROUTING_KEY.corpusSimilarityRequested),
    );
  }

  private async dispatch(
    msg: ConsumeMessage,
    expectedRoutingKey: string,
  ): Promise<void> {
    let event: AiJobEvent;
    try {
      event = JSON.parse(msg.content.toString('utf8')) as AiJobEvent;
    } catch {
      this.logger.error('AI job message is not valid JSON; nacking to DLQ');
      this.rabbit.nack(msg, false);
      return;
    }

    const jobId = event.jobId;
    if (!jobId) {
      this.logger.error(
        `AI job event missing jobId (routing=${expectedRoutingKey})`,
      );
      this.rabbit.nack(msg, false);
      return;
    }

    await this.jobsService.markQueued(jobId);

    try {
      if (event.type === 'SimilarityIndexRequested') {
        await this.processor.processSimilarityIndex(jobId);
      } else if (event.type === 'CorpusSimilarityRequested') {
        await this.processor.processCorpusSimilarity(jobId);
      } else {
        this.logger.error(
          `Unknown AI job event type: ${(event as AiJobEvent).type}`,
        );
        this.rabbit.nack(msg, false);
        return;
      }
      this.rabbit.ack(msg);
    } catch {
      const job = await this.jobsService.getJob(jobId).catch(() => null);
      if (this.processor.shouldRequeue(job)) {
        this.rabbit.nack(msg, true);
      } else {
        this.rabbit.nack(msg, false);
      }
    }
  }
}
