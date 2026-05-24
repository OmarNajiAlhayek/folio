import {
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, QueryFailedError, Repository } from 'typeorm';
import { redactOperatorErrorMessage } from '../common/email-operator-error-redaction';
import { OutboundEvent } from '../entities/outbound-event.entity';
import { RabbitMqPipelineMetrics, RabbitMqQueueMetricsService } from '../messaging/rabbitmq-queue-metrics.service';

const FAILED_SAMPLE_LIMIT = 15;
const DEAD_SAMPLE_LIMIT = 15;
const STUCK_REMINDER_MINUTES = 15;

export type EmailLogStatusCount = {
  pending: number;
  sent: number;
  failed: number;
};

export type FailedEmailSample = {
  id: string;
  idempotencyKey: string;
  template: string;
  createdAt: string;
  errorRedacted: string | null;
};

export type DeadOutboxSample = {
  id: string;
  routingKey: string;
  attempts: number;
  createdAt: string;
  lastErrorRedacted: string | null;
};

export type ReminderStatusCount = {
  pending: number;
  sent: number;
  cancelled: number;
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
  private readonly logger = new Logger(EmailPipelineObservabilityService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(OutboundEvent)
    private readonly outboxRepo: Repository<OutboundEvent>,
    private readonly queueMetrics: RabbitMqQueueMetricsService,
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

    const emailLog = await this.loadEmailLogSection();
    const reminders = await this.loadReminderSection();

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
      emailLog,
      reminders,
      rabbitMq,
    };
  }

  private async loadEmailLogSection(): Promise<{
    counts: EmailLogStatusCount;
    failedSample: FailedEmailSample[];
  }> {
    const counts: EmailLogStatusCount = {
      pending: 0,
      sent: 0,
      failed: 0,
    };
    try {
      const rows = (await this.dataSource.query(
        `SELECT status, COUNT(*)::int AS c
           FROM "email"."email_log"
          GROUP BY status`,
      )) as Array<{ status: string; c: number }>;
      for (const r of rows) {
        if (r.status === 'pending') counts.pending = r.c;
        else if (r.status === 'sent') counts.sent = r.c;
        else if (r.status === 'failed') counts.failed = r.c;
      }

      const failedRows = (await this.dataSource.query(
        `SELECT id, idempotency_key, template, created_at, error
           FROM "email"."email_log"
          WHERE status = 'failed'
          ORDER BY created_at DESC
          LIMIT $1`,
        [FAILED_SAMPLE_LIMIT],
      )) as Array<{
        id: string;
        idempotency_key: string;
        template: string;
        created_at: Date;
        error: string | null;
      }>;

      const failedSample: FailedEmailSample[] = failedRows.map((r) => ({
        id: r.id,
        idempotencyKey: r.idempotency_key,
        template: r.template,
        createdAt: new Date(r.created_at).toISOString(),
        errorRedacted: redactOperatorErrorMessage(r.error),
      }));

      return { counts, failedSample };
    } catch (e) {
      this.rethrowUnlessPermissionDenied(e);
    }
  }

  private async loadReminderSection(): Promise<{
    counts: ReminderStatusCount;
    stuckPendingPastDue: number;
  }> {
    const counts: ReminderStatusCount = {
      pending: 0,
      sent: 0,
      cancelled: 0,
    };
    try {
      const rows = (await this.dataSource.query(
        `SELECT status, COUNT(*)::int AS c
           FROM "email"."reminder"
          GROUP BY status`,
      )) as Array<{ status: string; c: number }>;
      for (const r of rows) {
        if (r.status === 'pending') counts.pending = r.c;
        else if (r.status === 'sent') counts.sent = r.c;
        else if (r.status === 'cancelled') counts.cancelled = r.c;
      }

      const stuckRows = (await this.dataSource.query(
        `SELECT COUNT(*)::int AS c
           FROM "email"."reminder"
          WHERE status = 'pending'
            AND send_at < NOW() - ($1::int * INTERVAL '1 minute')`,
        [STUCK_REMINDER_MINUTES],
      )) as Array<{ c: number }>;

      return {
        counts,
        stuckPendingPastDue: stuckRows[0]?.c ?? 0,
      };
    } catch (e) {
      this.rethrowUnlessPermissionDenied(e);
    }
  }

  private rethrowUnlessPermissionDenied(err: unknown): never {
    const driverErr = this.getPgDriverError(err);
    const message =
      driverErr?.message ?? (err instanceof Error ? err.message : '') ?? '';
    const code =
      driverErr?.code ??
      (typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      typeof (err as { code?: string }).code === 'string'
        ? (err as { code: string }).code
        : undefined);
    const looksLikeQueryFailed =
      err instanceof QueryFailedError ||
      (typeof err === 'object' &&
        err !== null &&
        (err as { name?: string }).name === 'QueryFailedError') ||
      driverErr !== undefined;

    if (
      looksLikeQueryFailed &&
      (code === '42501' || /permission denied/i.test(message))
    ) {
      this.logger.error(
        `Pipeline observability DB permission denied: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw new ForbiddenException({
        message:
          'Database permission denied for this operation. Apply grants for the app DB role (see backend/scripts/grant-email-reminder-admin.sql).',
        code: 'EMAIL_DB_FORBIDDEN',
      });
    }
    throw err;
  }

  private getPgDriverError(
    err: unknown,
  ): { code?: string; message?: string } | undefined {
    if (err instanceof QueryFailedError) {
      return err.driverError as { code?: string; message?: string };
    }
    if (
      typeof err === 'object' &&
      err !== null &&
      'driverError' in err &&
      typeof (err as { driverError?: unknown }).driverError === 'object' &&
      (err as { driverError?: unknown }).driverError !== null
    ) {
      return (err as { driverError: { code?: string; message?: string } })
        .driverError;
    }
    return undefined;
  }
}
