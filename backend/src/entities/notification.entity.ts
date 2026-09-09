import { Column, CreateDateColumn, Entity, Index } from 'typeorm';
import type { NotificationType } from '../notifications/notification-types';
import { BaseEntity } from '../common/base.entity';

@Entity('notifications')
@Index('ix_notifications_user_created', ['userId', 'createdAt'])
@Index('ix_notifications_user_read', ['userId', 'readAt'])
export class Notification extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  type: NotificationType;

  @Column({ name: 'title_key', type: 'varchar', length: 128 })
  titleKey: string;

  @Column({ name: 'body_key', type: 'varchar', length: 128 })
  bodyKey: string;

  @Column({ type: 'jsonb', default: {} })
  params: Record<string, unknown>;

  @Column({ type: 'varchar', length: 512 })
  href: string;

  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 256,
    unique: true,
  })
  idempotencyKey: string;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
