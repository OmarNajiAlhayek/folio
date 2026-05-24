import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ReviewerInvitedHandler } from './reviewer-invited.handler';
import { ReminderPolicyService } from '../policy/reminder-policy.service';
import { TemplatesService } from '../templates/templates.service';
import {
  EMAIL_PROVIDER_TOKEN,
  EmailProvider,
} from '../providers/email-provider';
import { EmailLog } from '../email-log/email-log.entity';
import { Reminder } from '../reminders/reminder.entity';
import { reviewerInvitedKey } from '../shared/idempotency';
import type { ReviewerInvitedEvent } from '../contracts/email-events';

const LOG_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function makeEvent(
  override: Partial<ReviewerInvitedEvent> = {},
): ReviewerInvitedEvent {
  const assignmentSlug = 'asg-test';
  return {
    type: 'ReviewerInvited',
    occurredAt: new Date().toISOString(),
    idempotencyKey: reviewerInvitedKey(assignmentSlug),
    assignmentSlug,
    submissionSlug: 'sub',
    submissionTitle: 'Title',
    reviewer: { id: 'u1', email: 'r@test.dev', displayName: 'Rev' },
    invitedBy: { id: 'e1', displayName: 'Ed' },
    acceptUrl: 'http://localhost/a/accept',
    declineUrl: 'http://localhost/a/decline',
    emailLocale: 'en',
    ...override,
  };
}

describe('ReviewerInvitedHandler', () => {
  let handler: ReviewerInvitedHandler;
  let mockProvider: jest.Mocked<Pick<EmailProvider, 'send'>>;
  let mockDs: {
    transaction: jest.Mock;
    getRepository: jest.Mock;
  };
  let reminderSave: jest.Mock;

  beforeEach(async () => {
    mockProvider = { send: jest.fn().mockResolvedValue({ messageId: 'mid-1' }) };

    reminderSave = jest.fn().mockResolvedValue(undefined);

    const qb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const rootLogRepo = {
      createQueryBuilder: jest.fn(() => qb),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const reminderRepo = {
      create: jest.fn((x) => x),
      save: reminderSave,
    };

    const txLogRepo = {
      findOne: jest.fn().mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.id === LOG_ID) {
          return {
            id: LOG_ID,
            idempotencyKey: reviewerInvitedKey('asg-test'),
            status: 'pending',
            recipient: 'r@test.dev',
            template: 'reviewer-invited',
            context: {},
          };
        }
        return null;
      }),
    };

    const mockManager = {
      query: jest.fn().mockResolvedValue([{ id: LOG_ID }]),
      getRepository: jest.fn((entity: unknown) => {
        if (entity === EmailLog) return txLogRepo;
        if (entity === Reminder) return reminderRepo;
        throw new Error('unexpected entity');
      }),
    };

    mockDs = {
      transaction: jest.fn(async (fn: (m: unknown) => Promise<EmailLog>) =>
        fn(mockManager),
      ),
      getRepository: jest.fn((entity: unknown) => {
        if (entity === EmailLog) return rootLogRepo;
        throw new Error('unexpected root entity');
      }),
    };

    const templates = {
      render: jest.fn().mockResolvedValue({
        subject: 'Review invitation: Title',
        html: '<p>Hi</p>',
        text: 'Hi',
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewerInvitedHandler,
        { provide: DataSource, useValue: mockDs },
        { provide: EMAIL_PROVIDER_TOKEN, useValue: mockProvider },
        { provide: TemplatesService, useValue: templates },
        {
          provide: ReminderPolicyService,
          useValue: {
            getDueOffsetsMs: jest.fn().mockResolvedValue({
              dueSoonMs: 18 * 24 * 60 * 60 * 1000,
              overdueMs: 22 * 24 * 60 * 60 * 1000,
            }),
          },
        },
      ],
    }).compile();

    handler = moduleRef.get(ReviewerInvitedHandler);
  });

  it('returns nack when idempotency key does not match assignment slug', async () => {
    const out = await handler.handle(
      makeEvent({ idempotencyKey: 'wrong-key' }),
    );
    expect(out).toEqual({
      kind: 'nack-no-requeue',
      reason: 'bad idempotency key',
    });
    expect(mockDs.transaction).not.toHaveBeenCalled();
  });

  it('ACKs on successful send', async () => {
    const out = await handler.handle(makeEvent());
    expect(out).toEqual({ kind: 'ack' });
    expect(mockProvider.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'r@test.dev',
      }),
    );
  });

  it('returns nack-no-requeue when provider throws', async () => {
    mockProvider.send.mockRejectedValueOnce(new Error('smtp down'));
    const out = await handler.handle(makeEvent());
    expect(out).toMatchObject({
      kind: 'nack-no-requeue',
      reason: expect.stringContaining('smtp down'),
    });
  });

  it('ACKs when existing row already sent (duplicate)', async () => {
    mockDs.transaction.mockImplementationOnce(
      async (fn: (m: unknown) => Promise<EmailLog>) => {
        const mgr = {
          query: jest.fn().mockResolvedValue([]),
          getRepository: jest.fn((entity: unknown) => {
            if (entity === EmailLog) {
              return {
                findOne: jest.fn().mockResolvedValue({
                  id: LOG_ID,
                  idempotencyKey: reviewerInvitedKey('asg-test'),
                  status: 'sent',
                }),
              };
            }
            if (entity === Reminder) {
              return {
                create: jest.fn((x) => x),
                save: jest.fn(),
              };
            }
            throw new Error('unexpected entity in duplicate test');
          }),
        };
        return fn(mgr);
      },
    );
    mockProvider.send.mockClear();
    const out = await handler.handle(makeEvent());
    expect(out).toEqual({ kind: 'ack' });
    expect(mockProvider.send).not.toHaveBeenCalled();
  });

  it('on conflict with pending log, does not create reminders and still sends', async () => {
    mockDs.transaction.mockImplementationOnce(
      async (fn: (m: unknown) => Promise<EmailLog>) => {
        const mgr = {
          query: jest.fn().mockResolvedValue([]),
          getRepository: jest.fn((entity: unknown) => {
            if (entity === EmailLog) {
              return {
                findOne: jest.fn().mockResolvedValue({
                  id: LOG_ID,
                  idempotencyKey: reviewerInvitedKey('asg-test'),
                  status: 'pending',
                  recipient: 'r@test.dev',
                  template: 'reviewer-invited',
                  context: {},
                }),
              };
            }
            if (entity === Reminder) {
              return {
                create: jest.fn((x) => x),
                save: reminderSave,
              };
            }
            throw new Error('unexpected entity');
          }),
        };
        return fn(mgr);
      },
    );
    reminderSave.mockClear();
    mockProvider.send.mockClear();
    const out = await handler.handle(makeEvent());
    expect(out).toEqual({ kind: 'ack' });
    expect(reminderSave).not.toHaveBeenCalled();
    expect(mockProvider.send).toHaveBeenCalled();
  });

  it('on conflict with failed log, does not create reminders and retries send', async () => {
    mockDs.transaction.mockImplementationOnce(
      async (fn: (m: unknown) => Promise<EmailLog>) => {
        const mgr = {
          query: jest.fn().mockResolvedValue([]),
          getRepository: jest.fn((entity: unknown) => {
            if (entity === EmailLog) {
              return {
                findOne: jest.fn().mockResolvedValue({
                  id: LOG_ID,
                  idempotencyKey: reviewerInvitedKey('asg-test'),
                  status: 'failed',
                  recipient: 'r@test.dev',
                  template: 'reviewer-invited',
                  context: {},
                }),
              };
            }
            if (entity === Reminder) {
              return {
                create: jest.fn((x) => x),
                save: reminderSave,
              };
            }
            throw new Error('unexpected entity');
          }),
        };
        return fn(mgr);
      },
    );
    reminderSave.mockClear();
    mockProvider.send.mockClear();
    const out = await handler.handle(makeEvent());
    expect(out).toEqual({ kind: 'ack' });
    expect(reminderSave).not.toHaveBeenCalled();
    expect(mockProvider.send).toHaveBeenCalled();
  });
});
