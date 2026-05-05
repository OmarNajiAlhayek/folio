import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, LessThanOrEqual, Or } from 'typeorm';
import { OutboundEvent } from '../entities/outbound-event.entity';
import { RabbitMqConnection } from './rabbitmq.connection';
import { redactEventPayload } from './shared/redactor';

const MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;
const DRAIN_BATCH = 25;

/**
 * Background worker that drains pending outbox rows to RabbitMQ.
 *
 * Behavior matches plan §7b:
 *   - Caps `attempts` at 8 with exponential backoff
 *     (next = min(60s * 2^attempts, 1h)).
 *   - Rows that exceed the cap are flipped to status='dead' and
 *     surfaced via `/health/outbox` (`OutboxHealthController`).
 *   - Drainer query: status='pending' AND (nextAttemptAt IS NULL
 *     OR nextAttemptAt <= now()).
 */
@Injectable()
export class OutboxDrainerService implements OnModuleInit {
  private readonly logger = new Logger(OutboxDrainerService.name);
  private running = false;

  constructor(
    @InjectRepository(OutboundEvent)
    private readonly outboxRepo: Repository<OutboundEvent>,
    private readonly rabbit: RabbitMqConnection,
  ) {}

  async onModuleInit(): Promise<void> {
    void this.tick();
  }

  @Interval(10_000)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.drainBatch();
    } catch (err) {
      this.logger.warn(
        `outbox drain batch failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async drainBatch(): Promise<void> {
    const now = new Date();
    const due = await this.outboxRepo.find({
      where: {
        status: 'pending',
        nextAttemptAt: Or(IsNull(), LessThanOrEqual(now)),
      },
      order: { createdAt: 'ASC' },
      take: DRAIN_BATCH,
    });

    for (const row of due) {
      await this.publishOne(row);
    }
  }

  private async publishOne(row: OutboundEvent): Promise<void> {
    try {
      await this.rabbit.publish(row.routingKey, row.payload);
      row.status = 'published';
      row.publishedAt = new Date();
      row.lastError = null;
      await this.outboxRepo.save(row);
      this.logger.debug(
        `outbox.published routing=${row.routingKey} ${JSON.stringify(redactEventPayload(row.payload))}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      row.attempts += 1;
      row.lastError = message.slice(0, 500);
      if (row.attempts >= MAX_ATTEMPTS) {
        row.status = 'dead';
        row.nextAttemptAt = null;
        this.logger.error(
          `outbox.dead id=${row.id} routing=${row.routingKey} attempts=${row.attempts} lastError=${message}`,
        );
      } else {
        const backoff = Math.min(
          BASE_BACKOFF_MS * 2 ** row.attempts,
          MAX_BACKOFF_MS,
        );
        row.nextAttemptAt = new Date(Date.now() + backoff);
        this.logger.warn(
          `outbox.retry id=${row.id} routing=${row.routingKey} attempt=${row.attempts} nextIn=${backoff}ms`,
        );
      }
      await this.outboxRepo.save(row);
    }
  }
}
