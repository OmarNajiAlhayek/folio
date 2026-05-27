import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { ReminderDueHandler } from './reminder-due.handler';
import { TemplatesService } from '../templates/templates.service';
import {
  EMAIL_PROVIDER_TOKEN,
  EmailProvider,
} from '../providers/email-provider';
import { EmailLog } from '../email-log/email-log.entity';
import { Reminder } from '../reminders/reminder.entity';
import { reminderDueKey } from '../shared/idempotency';
import type { ReminderDueEvent } from '../contracts/email-events';

const REMINDER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const LOG_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function baseEvent(over: Partial<ReminderDueEvent> = {}): ReminderDueEvent {
  return {
    type: 'ReminderDue',
    occurredAt: new Date().toISOString(),
    idempotencyKey: reminderDueKey(REMINDER_ID),
    reminderId: REMINDER_ID,
    kind: 'review_due_soon',
    assignmentSlug: 'asg-1',
    submissionTitle: 'Sample manuscript',
    reviewer: {
      id: 'u1',
      email: 'r@test.dev',
      displayName: 'Rev',
    },
    dueAt: new Date().toISOString(),
    ...over,
  };
}

describe('ReminderDueHandler', () => {
  let handler: ReminderDueHandler;
  let mockProvider: jest.Mocked<Pick<EmailProvider, 'send'>>;
  let mockReminderFindOne: jest.Mock;
  let mockReminderUpdate: jest.Mock;
  let logRepo: {
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(async () => {
    mockProvider = { send: jest.fn().mockResolvedValue({ messageId: 'mid-r' }) };

    mockReminderUpdate = jest.fn().mockResolvedValue({ affected: 1 });

    mockReminderFindOne = jest.fn().mockResolvedValue({
      id: REMINDER_ID,
      assignmentSlug: 'asg-1',
      submissionTitle: 'Sample manuscript',
      status: 'pending',
      reviewerId: 'u1',
      reviewerEmail: 'r@test.dev',
      reviewerDisplayName: 'Rev',
      kind: 'review_due_soon',
      sendAt: new Date(),
    });

    const qb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    logRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(() => qb),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const mockDs = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === Reminder) {
          return { findOne: mockReminderFindOne, update: mockReminderUpdate };
        }
        if (entity === EmailLog) {
          return logRepo;
        }
        throw new Error('unexpected entity');
      }),
      query: jest.fn().mockResolvedValue([{ id: LOG_ID }]),
      transaction: jest.fn(
        async (fn: (em: EntityManager) => Promise<void>) => {
          const em = {
            getRepository: (entity: unknown) => {
              if (entity === EmailLog) {
                return logRepo;
              }
              if (entity === Reminder) {
                return { update: mockReminderUpdate };
              }
              throw new Error('unexpected entity in tx');
            },
          } as unknown as EntityManager;
          await fn(em);
        },
      ),
    };

    const templates = {
      render: jest
        .fn()
        .mockImplementation(
          async (
            _name: string,
            _locale: string,
            ctx: Record<string, unknown>,
          ) => ({
            subject: `Reminder ${ctx.submissionTitle}`,
            html: `<p>${ctx.submissionTitle}</p>`,
            text: String(ctx.submissionTitle),
          }),
        ),
    };

    logRepo.findOne.mockResolvedValue({
      id: LOG_ID,
      idempotencyKey: reminderDueKey(REMINDER_ID),
      status: 'pending',
      recipient: 'r@test.dev',
      template: 'reminder-due',
      context: {},
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReminderDueHandler,
        { provide: DataSource, useValue: mockDs },
        { provide: EMAIL_PROVIDER_TOKEN, useValue: mockProvider },
        { provide: TemplatesService, useValue: templates },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(() => 'http://localhost:5240'),
          },
        },
      ],
    }).compile();

    handler = moduleRef.get(ReminderDueHandler);
  });

  it('nacks on idempotency mismatch', async () => {
    const out = await handler.handle(
      baseEvent({ idempotencyKey: 'bad' }),
    );
    expect(out).toEqual({
      kind: 'nack-no-requeue',
      reason: 'bad idempotency key',
    });
    expect(mockReminderFindOne).not.toHaveBeenCalled();
  });

  it('ACKs when reminder is not pending (stale)', async () => {
    mockReminderFindOne.mockResolvedValueOnce(null);
    const out = await handler.handle(baseEvent());
    expect(out).toEqual({ kind: 'ack' });
    expect(mockProvider.send).not.toHaveBeenCalled();
  });

  it('ACKs without send when reminder cancelled before provider.send', async () => {
    mockReminderFindOne
      .mockResolvedValueOnce({
        id: REMINDER_ID,
        assignmentSlug: 'asg-1',
        status: 'pending',
        reviewerId: 'u1',
        reviewerEmail: 'r@test.dev',
        reviewerDisplayName: 'Rev',
        kind: 'review_due_soon',
        sendAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: REMINDER_ID,
        assignmentSlug: 'asg-1',
        status: 'cancelled',
        reviewerId: 'u1',
        reviewerEmail: 'r@test.dev',
        reviewerDisplayName: 'Rev',
        kind: 'review_due_soon',
        sendAt: new Date(),
      });
    const out = await handler.handle(baseEvent());
    expect(out).toEqual({ kind: 'ack' });
    expect(mockProvider.send).not.toHaveBeenCalled();
    expect(logRepo.update).toHaveBeenCalledWith(
      { id: LOG_ID },
      expect.objectContaining({
        status: 'failed',
        error: 'reminder_no_longer_pending_before_send',
      }),
    );
  });

  it('ACKs on successful send', async () => {
    const out = await handler.handle(baseEvent());
    expect(out).toEqual({ kind: 'ack' });
    expect(mockProvider.send).toHaveBeenCalled();
  });

  it('renders submissionTitle from event in template context', async () => {
    await handler.handle(baseEvent({ submissionTitle: 'My paper title' }));
    const call = mockProvider.send.mock.calls[0]?.[0];
    expect(call?.html).toContain('My paper title');
  });

  it('falls back to [manuscript] when submissionTitle is empty', async () => {
    mockReminderFindOne.mockResolvedValue({
      id: REMINDER_ID,
      assignmentSlug: 'asg-1',
      submissionTitle: '',
      status: 'pending',
      reviewerId: 'u1',
      reviewerEmail: 'r@test.dev',
      reviewerDisplayName: 'Rev',
      kind: 'review_due_soon',
      sendAt: new Date(),
    });
    await handler.handle(baseEvent({ submissionTitle: '' }));
    const call = mockProvider.send.mock.calls[0]?.[0];
    expect(call?.html).toContain('[manuscript]');
  });

  it('nack-no-requeue and marks email_log failed when provider send rejects', async () => {
    mockProvider.send.mockRejectedValueOnce(new Error('smtp timeout'));
    const out = await handler.handle(baseEvent());
    expect(out).toMatchObject({
      kind: 'nack-no-requeue',
      reason: expect.stringContaining('smtp timeout'),
    });
    expect(logRepo.update).toHaveBeenCalledWith(
      { id: LOG_ID },
      expect.objectContaining({ status: 'failed' }),
    );
  });
});
