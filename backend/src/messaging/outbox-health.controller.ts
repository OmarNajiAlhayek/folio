import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { skipAllThrottles } from '../common/throttle-profiles';
import { OpsMetricsGuard } from '../common/guards/ops-metrics.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { OutboundEvent } from '../entities/outbound-event.entity';

/**
 * Operational view of the outbox: how many rows are pending, how many
 * have exceeded the retry cap (`dead`), the oldest pending row
 * timestamp, and **dueNow** (pending rows ready to publish: no
 * `next_attempt_at` or `next_attempt_at <= now`). Surfaced under `/api/v1/health/outbox` so deploy/monitor
 * tooling can alert when the broker is down or the drainer is stuck.
 *
 * Returns counts only — no payloads, no PII. Open by default so the k6 harness,
 * the e2e suite and monitoring keep working unchanged; set `OPS_METRICS_TOKEN`
 * on a deployed instance to require `x-folio-ops-token`. See OpsMetricsGuard.
 */
@ApiTags('health')
@Controller('health/outbox')
@SkipThrottle(skipAllThrottles())
@UseGuards(OpsMetricsGuard)
export class OutboxHealthController {
  constructor(
    @InjectRepository(OutboundEvent)
    private readonly outboxRepo: Repository<OutboundEvent>,
  ) {}

  @Get()
  async stats() {
    const now = new Date();
    const [pending, dead, published, oldestPending, dueNow] = await Promise.all(
      [
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
      ],
    );
    return {
      pending,
      dead,
      published,
      dueNow,
      oldestPending: oldestPending
        ? {
            id: oldestPending.id,
            routingKey: oldestPending.routingKey,
            attempts: oldestPending.attempts,
            createdAt: oldestPending.createdAt,
          }
        : null,
    };
  }
}
