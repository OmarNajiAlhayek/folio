import { Test } from '@nestjs/testing';
import { ReviewerRespondedHandler } from './reviewer-responded.handler';
import { ReminderAdminService } from '../admin/reminder-admin.service';
import { reviewerRespondedKey } from '@folio/shared/messaging/idempotency';
import type { ReviewerRespondedEvent } from '@folio/shared/contracts/email-events';

function baseEvent(
  over: Partial<ReviewerRespondedEvent> = {},
): ReviewerRespondedEvent {
  const assignmentSlug = 'asg-1';
  const outcome = 'declined' as const;
  return {
    type: 'ReviewerResponded',
    occurredAt: new Date().toISOString(),
    idempotencyKey: reviewerRespondedKey(assignmentSlug, outcome),
    assignmentSlug,
    outcome,
    reviewer: { id: 'u1', displayName: 'Rev' },
    ...over,
  };
}

describe('ReviewerRespondedHandler', () => {
  let handler: ReviewerRespondedHandler;
  let reminders: {
    cancelAllPendingForAssignment: jest.Mock;
  };

  beforeEach(async () => {
    reminders = {
      cancelAllPendingForAssignment: jest
        .fn()
        .mockResolvedValue({ cancelledCount: 2 }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewerRespondedHandler,
        { provide: ReminderAdminService, useValue: reminders },
      ],
    }).compile();

    handler = moduleRef.get(ReviewerRespondedHandler);
  });

  it('nacks when idempotency key does not match', async () => {
    const outcome = await handler.handle(
      baseEvent({ idempotencyKey: 'wrong-key' }),
    );
    expect(outcome).toEqual({
      kind: 'nack-no-requeue',
      reason: 'bad idempotency key',
    });
    expect(reminders.cancelAllPendingForAssignment).not.toHaveBeenCalled();
  });

  it('cancels pending reminders and acks', async () => {
    const outcome = await handler.handle(baseEvent());
    expect(outcome).toEqual({ kind: 'ack' });
    expect(reminders.cancelAllPendingForAssignment).toHaveBeenCalledWith(
      'asg-1',
    );
  });

  it('acks when no pending reminders exist', async () => {
    reminders.cancelAllPendingForAssignment.mockResolvedValue({
      cancelledCount: 0,
    });
    const outcome = await handler.handle(
      baseEvent({
        outcome: 'completed',
        idempotencyKey: reviewerRespondedKey('asg-1', 'completed'),
      }),
    );
    expect(outcome).toEqual({ kind: 'ack' });
    expect(reminders.cancelAllPendingForAssignment).toHaveBeenCalledWith(
      'asg-1',
    );
  });
});
