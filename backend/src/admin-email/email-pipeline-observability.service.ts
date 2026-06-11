import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { redactOperatorErrorMessage } from '../common/email-operator-error-redaction';
import { EmailServiceClient } from '../email-client/email-client.service';
import type {
  EmailLogStatusCount,
  FailedEmailSample,
  ReminderStatusCount,
} from '../email-client/email-client.types';
import { OutboundEvent } from '../entities/outbound-event.entity';
import {
  RabbitMqPipelineMetrics,
  RabbitMqQueueMetricsService,
} from '../messaging/rabbitmq-queue-metrics.service';

const DEAD_SAMPLE_LIMIT = 15;

export type { EmailLogStatusCount, FailedEmailSample, ReminderStatusCount };

export type DeadOutboxSample = {
  id: string;
  routingKey: string;
  attempts: number;
  createdAt: string;
  lastErrorRedacted: string | null;
};

export type PipelineStatusResponse = {
  outbox: {
    pending: number;
    dead: number;
    published: number;
    dueNow: number;
    oldestPending: {
      id: string;
      routingKey: string;
      attempts: number;
      createdAt: string;
    } | null;
    deadSample: DeadOutboxSample[];
  };
  emailLog: {
    counts: EmailLogStatusCount;
    failedSample: FailedEmailSample[];
  };
  reminders: {
    counts: ReminderStatusCount;
    stuckPendingPastDue: number;
  };
  rabbitMq: RabbitMqPipelineMetrics;
};

@Injectable()
export class EmailPipelineObservabilityService {
  constructor(
    @InjectRepository(OutboundEvent)
    private readonly outboxRepo: Repository<OutboundEvent>,
    private readonly queueMetrics: RabbitMqQueueMetricsService,
    private readonly emailClient: EmailServiceClient,
  ) {}

  async getPipelineStatus(): Promise<PipelineStatusResponse> {
    const now = new Date();
    const [
      pending,
      dead,
      published,
      oldestPending,
      dueNow,
      deadSampleRows,
      rabbitMq,
      emailSlice,
    ] = await Promise.all([
      this.outboxRepo.count({ where: { status: 'pending' } }),
      this.outboxRepo.count({ where: { status: 'dead' } }),
      this.outboxRepo.count({ where: { status: 'published' } }),
      this.outboxRepo.findOne({
        where: { status: 'pending' },
        order: { createdAt: 'ASC' },
        select: ['id', 'createdAt', 'routingKey', 'attempts'],
      }),
      this.outboxRepo
        .createQueryBuilder('o')
        .where('o.status = :status', { status: 'pending' })
        .andWhere(
          new Brackets((qb) => {
            qb.where('o.nextAttemptAt IS NULL').orWhere(
              'o.nextAttemptAt <= :now',
              { now },
            );
          }),
        )
        .getCount(),
      this.outboxRepo.find({
        where: { status: 'dead' },
        order: { createdAt: 'DESC' },
        take: DEAD_SAMPLE_LIMIT,
        select: ['id', 'routingKey', 'attempts', 'createdAt', 'lastError'],
      }),
      this.queueMetrics.getCachedMetrics(),
      this.emailClient.getPipelineSlice(),
    ]);

    return {
      outbox: {
        pending,
        dead,
        published,
        dueNow,
        oldestPending: oldestPending
          ? {
              id: oldestPending.id,
              routingKey: oldestPending.routingKey,
              attempts: oldestPending.attempts,
              createdAt: oldestPending.createdAt.toISOString(),
            }
          : null,
        deadSample: deadSampleRows.map((r) => ({
          id: r.id,
          routingKey: r.routingKey,
          attempts: r.attempts,
          createdAt: r.createdAt.toISOString(),
          lastErrorRedacted: redactOperatorErrorMessage(r.lastError),
        })),
      },
      emailLog: emailSlice.emailLog,
      reminders: emailSlice.reminders,
      rabbitMq,
    };
  }
}
