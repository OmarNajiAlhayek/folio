import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type ReminderKind = 'review_due_soon' | 'review_overdue';
export type ReminderStatus = 'pending' | 'sent' | 'cancelled';

/**
 * A scheduled email. Created by the `reviewer.invited` handler and
 * picked up later by `RemindersScheduler`, which publishes a
 * `reminder.due` event back through the broker (plan §6) when
 * `sendAt <= now()`.
 *
 * Cancellation is reserved for future `ReviewerResponded` events;
 * v1 has no consumer for that yet, so the cron also re-checks
 * assignment status by calling the backend before publishing.
 */
@Entity({ name: 'reminder', schema: 'email' })
@Index('ix_reminder_due', ['status', 'sendAt'])
export class Reminder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'assignment_slug', type: 'varchar', length: 260 })
  assignmentSlug: string;

  /** Snapshot of submission title when the invite created this reminder. */
  @Column({ name: 'submission_title', type: 'varchar', length: 500, default: '' })
  submissionTitle: string;

  @Column({ name: 'reviewer_id', type: 'varchar', length: 64 })
  reviewerId: string;

  @Column({ name: 'reviewer_email', type: 'varchar', length: 320 })
  reviewerEmail: string;

  @Column({ name: 'reviewer_display_name', type: 'varchar', length: 200 })
  reviewerDisplayName: string;

  @Column({ type: 'varchar', length: 32 })
  kind: ReminderKind;

  /**
   * Snapshot of invitation-time resolved email locale (`en` | `ar`).
   */
  @Column({ name: 'email_locale', type: 'varchar', length: 10 })
  emailLocale: string;

  @Column({ name: 'send_at', type: 'timestamptz' })
  sendAt: Date;

  /** Set while a scheduler instance is publishing `reminder.due` for this row. */
  @Column({ name: 'picked_at', type: 'timestamptz', nullable: true })
  pickedAt: Date | null;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: ReminderStatus;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
