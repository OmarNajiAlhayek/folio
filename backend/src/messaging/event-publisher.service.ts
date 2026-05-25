import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { OutboundEvent } from '../entities/outbound-event.entity';
import { redactEventPayload } from './shared/redactor';

/**
 * Publishes events through the transactional outbox. Callers MUST run
 * `enqueue()` inside the same transaction as the domain change they
 * are publishing about (the EntityManager parameter makes this
 * explicit). The actual broker publish happens later, in
 * `OutboxDrainerService`. Example: `SubmissionsService.assignReviewer`
 * passes the transactional `EntityManager` so `review_assignments` and
 * `outbound_event_outbox` commit together.
 *
 * This is the "publish after DB commit" rule from plan §5b: the row
 * exists alongside the domain row, so a broker outage never silently
 * drops the event.
 */
@Injectable()
export class EventPublisherService {
  private readonly logger = new Logger(EventPublisherService.name);

  constructor(
    @InjectRepository(OutboundEvent)
    private readonly outboxRepo: Repository<OutboundEvent>,
  ) {}

  /**
   * Insert an outbox row. Pass `manager` from your service's transaction
   * (e.g. via `repository.manager.transaction(async (m) => ...)`) so the row
   * commits atomically with your domain write (e.g. `assignReviewer` +
   * `review_assignments`).
   *
   * Pass `null` only when inserting the outbox row standalone (no
   * co-located domain write in the same transaction).
   */
  async enqueue(
    routingKey: string,
    payload: Record<string, unknown>,
    manager: EntityManager | null = null,
  ): Promise<void> {
    const repo = manager
      ? manager.getRepository(OutboundEvent)
      : this.outboxRepo;
    const row = repo.create({
      routingKey,
      payload,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: null,
    });
    await repo.save(row);
    this.logger.debug(
      `outbox.enqueue routing=${routingKey} ${JSON.stringify(redactEventPayload(payload))}`,
    );
  }

  /**
   * Insert multiple outbox rows in one save (same transactional rules as `enqueue`).
   */
  async enqueueMany(
    events: { routingKey: string; payload: Record<string, unknown> }[],
    manager: EntityManager | null = null,
  ): Promise<void> {
    if (events.length === 0) {
      return;
    }
    const repo = manager
      ? manager.getRepository(OutboundEvent)
      : this.outboxRepo;
    const rows = events.map((event) =>
      repo.create({
        routingKey: event.routingKey,
        payload: event.payload,
        status: 'pending',
        attempts: 0,
        nextAttemptAt: null,
      }),
    );
    await repo.save(rows);
    this.logger.debug(
      `outbox.enqueueMany count=${events.length} routing=${events[0]!.routingKey}`,
    );
  }
}
