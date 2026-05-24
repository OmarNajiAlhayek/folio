import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type EmailLogStatus = 'pending' | 'sent' | 'failed';

/**
 * Single source of truth for "did we already send this email?". The
 * unique index on `idempotency_key` is what makes the handler state
 * machine in plan §6 work: the first delivery wins
 * `INSERT ... ON CONFLICT DO NOTHING`, and any redelivery loses the
 * race and branches based on the existing row's `status`.
 */
@Entity({ name: 'email_log', schema: 'email' })
@Index('ux_email_log_idempotency_key', ['idempotencyKey'], { unique: true })
export class EmailLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 200 })
  idempotencyKey: string;

  @Column({ name: 'recipient', type: 'varchar', length: 320 })
  recipient: string;

  @Column({ type: 'varchar', length: 64 })
  template: string;

  @Column({ type: 'jsonb' })
  context: Record<string, unknown>;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: EmailLogStatus;

  @Column({
    name: 'provider_message_id',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  providerMessageId: string | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
