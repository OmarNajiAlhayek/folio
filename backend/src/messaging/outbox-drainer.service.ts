import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OutboundEvent } from '../entities/outbound-event.entity';
import { RabbitMqConnection } from './rabbitmq.connection';
import { unwrapPgQueryRows } from '../common/unwrap-pg-query-rows';
import { redactEventPayload } from './shared/redactor';

const MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;
const DRAIN_BATCH = 25;
/** Stale claims are reclaimed after this interval (crashed drainer instance). */
const CLAIM_LEASE_MS = 120_000;

type OutboxRow = {
  id: string;
  routing_key: string;
  payload: Record<string, unknown>;
  attempts: number;
  last_error: string | null;
  status: string;
  next_attempt_at: Date | null;
  claimed_at: Date | null;
  published_at: Date | null;
  created_at: Date;
};

/**
 * Background worker that drains pending outbox rows to RabbitMQ.
 *
 * Uses `FOR UPDATE SKIP LOCKED` + `claimed_at` so multiple API instances
 * can run the drainer without double-publishing the same row.
 */
@Injectable()
export class OutboxDrainerService implements OnModuleInit {
  private readonly logger = new Logger(OutboxDrainerService.name);
  private running = false;

  constructor(
    @InjectRepository(OutboundEvent)
    private readonly outboxRepo: Repository<OutboundEvent>,
    @InjectDataSource() private readonly dataSource: DataSource,
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
      const due = await this.claimDueBatch();
      for (const row of due) {
        await this.publishOne(row);
      }
    } catch (err) {
      this.logger.warn(
        `outbox drain batch failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async claimDueBatch(): Promise<OutboundEvent[]> {
    const raw = await this.dataSource.query(
      `UPDATE "outbound_event_outbox" AS o
          SET "claimed_at" = now()
        WHERE o."id" IN (
          SELECT "id"
            FROM "outbound_event_outbox"
           WHERE "status" = 'pending'
             AND ("next_attempt_at" IS NULL OR "next_attempt_at" <= now())
             AND (
               "claimed_at" IS NULL
               OR "claimed_at" < now() - ($2::int * interval '1 millisecond')
             )
           ORDER BY "created_at" ASC
           LIMIT $1
           FOR UPDATE SKIP LOCKED
        )
        RETURNING o."id", o."routing_key", o."payload", o."attempts",
                  o."last_error", o."status", o."next_attempt_at",
                  o."claimed_at", o."published_at", o."created_at"`,
      [DRAIN_BATCH, CLAIM_LEASE_MS],
    );
    const rows = unwrapPgQueryRows<OutboxRow>(raw);

    return rows.map((r) => this.mapRow(r));
  }

  private mapRow(r: OutboxRow): OutboundEvent {
    const row = new OutboundEvent();
    row.id = r.id;
    row.routingKey = r.routing_key;
    row.payload = r.payload;
    row.attempts = Number(r.attempts) || 0;
    row.lastError = r.last_error;
    row.status = r.status as OutboundEvent['status'];
    row.nextAttemptAt = r.next_attempt_at;
    row.claimedAt = r.claimed_at;
    row.publishedAt = r.published_at;
    row.createdAt = r.created_at;
    return row;
  }

  private async publishOne(row: OutboundEvent): Promise<void> {
    try {
      await this.rabbit.publish(row.routingKey, row.payload);
      row.status = 'published';
      row.publishedAt = new Date();
      row.lastError = null;
      row.claimedAt = null;
      await this.outboxRepo.save(row);
      this.logger.debug(
        `outbox.published routing=${row.routingKey} ${JSON.stringify(redactEventPayload(row.payload))}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      row.attempts += 1;
      row.lastError = message.slice(0, 500);
      row.claimedAt = null;
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
