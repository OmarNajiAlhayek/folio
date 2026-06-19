import { Injectable, Logger } from '@nestjs/common';
import { ReviewerRespondedEvent } from '@folio/shared/contracts/email-events';
import { ReminderAdminService } from '../admin/reminder-admin.service';
import { reviewerRespondedKey } from '@folio/shared/messaging/idempotency';
import { redactEventPayload } from '@folio/shared/messaging/redactor';
import { isTransientDbError } from '../common/transient-error.util';
import { ACK, HandlerOutcome } from './handler-result';

/**
 * Cancels pending review reminders when a reviewer declines or submits a
 * review. No outbound email — only flips `email.reminder` rows to
 * `cancelled` so the scheduler stops publishing `reminder.due` events.
 */
@Injectable()
export class ReviewerRespondedHandler {
  private readonly logger = new Logger(ReviewerRespondedHandler.name);

  constructor(private readonly reminders: ReminderAdminService) {}

  async handle(event: ReviewerRespondedEvent): Promise<HandlerOutcome> {
    if (
      event.idempotencyKey !==
      reviewerRespondedKey(event.assignmentSlug, event.outcome)
    ) {
      this.logger.warn(
        `idempotencyKey mismatch ${JSON.stringify(redactEventPayload(event))}`,
      );
      return { kind: 'nack-no-requeue', reason: 'bad idempotency key' };
    }

    try {
      const { cancelledCount } =
        await this.reminders.cancelAllPendingForAssignment(
          event.assignmentSlug,
        );
      this.logger.debug(
        `reviewer.responded assignment=${event.assignmentSlug} outcome=${event.outcome} cancelled=${cancelledCount}`,
      );
      return ACK;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isTransientDbError(err)) {
        this.logger.warn(
          `transient DB error cancelling reminders assignment=${event.assignmentSlug}: ${message}`,
        );
        return { kind: 'nack-requeue', reason: message };
      }
      throw err;
    }
  }
}
