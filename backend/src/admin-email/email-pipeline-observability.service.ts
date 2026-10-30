import { HttpException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { redactOperatorErrorMessage } from '../common/email-operator-error-redaction';
import { EmailServiceClient } from '../email-client/email-client.service';
import type {
  EmailLogStatusCount,
  EmailPipelineSlice,
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
  /** False when the mail worker cannot be reached. Outbox and broker stats still return. */
  emailWorker: { available: boolean };
};

const EMPTY_EMAIL_SLICE: EmailPipelineSlice = {
  emailLog: {
    counts: { pending: 0, sent: 0, failed: 0 },
    failedSample: [] as FailedEmailSample[],
  },
  reminders: {
    counts: { pending: 0, sent: 0, cancelled: 0 },
    stuckPendingPastDue: 0,
  },
};

function isEmailWorkerDown(err: unknown): boolean {
  if (!(err instanceof HttpException) || err.getStatus() !== 503) return false;
  const body = err.getResponse();
  return (
    typeof body === 'object' &&
    body !== null &&
    'code' in body &&
    (body as { code?: string }).code === 'EMAIL_SERVICE_UNAVAILABLE'
  );
}

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
    ]);

    let emailSlice: Awaited<
      ReturnType<EmailServiceClient['getPipelineSlice']>
    > = EMPTY_EMAIL_SLICE;
    let emailWorkerAvailable = true;
    try {
      emailSlice = await this.emailClient.getPipelineSlice();
    } catch (err) {
      if (!isEmailWorkerDown(err)) throw err;
      emailWorkerAvailable = false;
    }

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
      emailWorker: { available: emailWorkerAvailable },
    };
  }
}
