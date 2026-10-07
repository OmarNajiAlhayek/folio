import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ConsumeMessage } from 'amqplib';
import { AiJobsProcessor } from './ai-jobs.processor';
import { AiJobsRabbitMqConnection } from './ai-jobs-rabbitmq.connection';
import { AiJobsService } from './ai-jobs.service';
import { AiJob } from '../entities/ai-job.entity';
import {
  AI_ROUTING_KEY,
  type AiJobEvent,
} from '../messaging/contracts/ai-events';
import { isAiJobsConsumerEnabled } from './ai-jobs-consumer.enabled';

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
    this.enabled = isAiJobsConsumerEnabled({
      consumerFlag: config.get<string>('AI_JOBS_CONSUMER_ENABLED'),
      aiServiceEnabled: config.get<string>('AI_SERVICE_ENABLED'),
    });
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.log('AI jobs consumer disabled');
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

    const queued = await this.jobsService.markQueued(jobId);
    if (!queued) {
      this.rabbit.ack(msg);
      return;
    }

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
      let job: AiJob | null = null;
      try {
        job = await this.jobsService.getJob(jobId);
      } catch (getJobErr) {
        if (getJobErr instanceof NotFoundException) {
          this.rabbit.nack(msg, false);
        } else {
          this.rabbit.nack(msg, true);
        }
        return;
      }
      if (this.processor.shouldRequeue(job)) {
        this.rabbit.nack(msg, true);
      } else {
        this.rabbit.nack(msg, false);
      }
    }
  }
}
