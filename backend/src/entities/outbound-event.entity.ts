import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type OutboundEventStatus = 'pending' | 'published' | 'dead';

/**
 * Transactional outbox row. Written in the same DB commit as a domain
 * change (e.g. creating a `ReviewAssignment`) so a broker outage cannot
 * lose the event silently. A small interval drainer publishes pending
 * rows to RabbitMQ and marks them `published`; rows that exceed the
 * retry cap become `dead` and are surfaced via `/health/outbox`.
 *
 * See plan §5b and §7b.
 */
@Entity('outbound_event_outbox')
@Index('ix_outbox_pending_next_attempt', ['status', 'nextAttemptAt'])
export class OutboundEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'routing_key', type: 'varchar', length: 128 })
  routingKey: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ default: 0 })
  attempts: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: OutboundEventStatus;

  @Column({ name: 'next_attempt_at', type: 'timestamptz', nullable: true })
  nextAttemptAt: Date | null;

  /** Short-lived claim so multiple API instances do not drain the same row. */
  @Column({ name: 'claimed_at', type: 'timestamptz', nullable: true })
  claimedAt: Date | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
