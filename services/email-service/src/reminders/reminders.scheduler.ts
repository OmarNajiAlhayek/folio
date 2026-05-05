import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Reminder } from './reminder.entity';
import { RabbitMqConnection } from '../amqp/rabbitmq.connection';
import {
  ReminderDueEvent,
  ROUTING_KEY,
} from '../contracts/email-events';
import { reminderDueKey } from '../shared/idempotency';

const BATCH_SIZE = 50;

/**
 * Picks Reminder rows whose `sendAt` has passed and republishes them
 * onto the `reminder.due` routing key. Doing it via the broker (instead
 * of sending directly) means template rendering, retries, dedupe, and
 * DLQ live in exactly one place — the same handler as immediate sends.
 *
 * Stays simple: one batch per minute, no claim/lock yet (single
 * scheduler instance assumed). When we run multiple replicas, this
 * is the spot to switch to SELECT ... FOR UPDATE SKIP LOCKED or a
 * dedicated `picked_at` column.
 */
@Injectable()
export class RemindersScheduler {
  private readonly logger = new Logger(RemindersScheduler.name);
  private running = false;

  constructor(
    @InjectRepository(Reminder)
    private readonly remindersRepo: Repository<Reminder>,
    private readonly rabbit: RabbitMqConnection,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const due = await this.remindersRepo.find({
        where: { status: 'pending', sendAt: LessThanOrEqual(now) },
        take: BATCH_SIZE,
        order: { sendAt: 'ASC' },
      });
      for (const reminder of due) {
        await this.publishOne(reminder);
      }
    } catch (err) {
      this.logger.warn(
        `reminders tick failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async publishOne(reminder: Reminder): Promise<void> {
    const event: ReminderDueEvent = {
      type: 'ReminderDue',
      occurredAt: new Date().toISOString(),
      idempotencyKey: reminderDueKey(reminder.id),
      reminderId: reminder.id,
      kind: reminder.kind,
      assignmentSlug: reminder.assignmentSlug,
      reviewer: {
        id: reminder.reviewerId,
        email: reminder.reviewerEmail,
        displayName: reminder.reviewerDisplayName,
      },
      dueAt: reminder.sendAt.toISOString(),
    };
    try {
      await this.rabbit.publish(
        ROUTING_KEY.reminderDue,
        event as unknown as Record<string, unknown>,
      );
    } catch (err) {
      this.logger.warn(
        `failed to publish reminder.due id=${reminder.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
