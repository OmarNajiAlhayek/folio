import { Test } from '@nestjs/testing';
import type { ConsumeMessage } from 'amqplib';
import { ConsumersService } from './consumers.service';
import { RabbitMqConnection } from '../amqp/rabbitmq.connection';
import { ReviewerInvitedHandler } from './reviewer-invited.handler';
import { ReminderDueHandler } from './reminder-due.handler';
import { DEFAULT_TOPOLOGY } from '../shared/topology';

function makeConsumeMessage(
  body: string | Record<string, unknown>,
): ConsumeMessage {
  const buf = Buffer.from(
    typeof body === 'string' ? body : JSON.stringify(body),
    'utf8',
  );
  return {
    content: buf,
    fields: {
      consumerTag: 'c',
      deliveryTag: 1,
      exchange: '',
      redelivered: false,
      routingKey: 'ignored',
    },
    properties: {
      contentType: 'application/json',
    },
  } as ConsumeMessage;
}

describe('ConsumersService', () => {
  let service: ConsumersService;
  let reviewerCb!: (msg: ConsumeMessage) => Promise<void>;
  let reminderCb!: (msg: ConsumeMessage) => Promise<void>;
  let ack: jest.Mock;
  let nack: jest.Mock;
  let reviewerHandle: jest.Mock;
  let reminderHandle: jest.Mock;

  beforeEach(async () => {
    ack = jest.fn();
    nack = jest.fn();
    reviewerHandle = jest.fn().mockResolvedValue({ kind: 'ack' });
    reminderHandle = jest.fn().mockResolvedValue({ kind: 'ack' });

    const rabbit = {
      getTopology: jest.fn().mockReturnValue(DEFAULT_TOPOLOGY),
      consume: jest.fn(async (queue: string, handler: typeof reviewerCb) => {
        if (queue === DEFAULT_TOPOLOGY.reviewerInvitedQueue) {
          reviewerCb = handler;
        } else if (queue === DEFAULT_TOPOLOGY.reminderDueQueue) {
          reminderCb = handler;
        }
      }),
      ack,
      nack,
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ConsumersService,
        { provide: RabbitMqConnection, useValue: rabbit },
        {
          provide: ReviewerInvitedHandler,
          useValue: { handle: reviewerHandle },
        },
        {
          provide: ReminderDueHandler,
          useValue: { handle: reminderHandle },
        },
      ],
    }).compile();

    service = moduleRef.get(ConsumersService);
    await service.onModuleInit();
  });

  it('nacks invalid JSON and does not call handlers (reviewer queue)', async () => {
    await reviewerCb(makeConsumeMessage('not-json{'));

    expect(nack).toHaveBeenCalledWith(expect.anything(), false);
    expect(reviewerHandle).not.toHaveBeenCalled();
    expect(reminderHandle).not.toHaveBeenCalled();
    expect(ack).not.toHaveBeenCalled();
  });

  it('nacks routingKey/body mismatch on reviewer queue', async () => {
    await reviewerCb(
      makeConsumeMessage({
        type: 'ReminderDue',
        occurredAt: new Date().toISOString(),
        idempotencyKey: 'reminder_due:x',
        reminderId: 'r1',
        kind: 'review_due_soon',
        assignmentSlug: 'a',
        reviewer: { id: 'u', email: 'e@test.dev', displayName: 'R' },
        dueAt: new Date().toISOString(),
      }),
    );

    expect(nack).toHaveBeenCalledWith(expect.anything(), false);
    expect(reviewerHandle).not.toHaveBeenCalled();
    expect(ack).not.toHaveBeenCalled();
  });

  it('nacks routingKey/body mismatch on reminder queue', async () => {
    await reminderCb(
      makeConsumeMessage({
        type: 'ReviewerInvited',
        occurredAt: new Date().toISOString(),
        idempotencyKey: 'reviewer_invited:asg',
        assignmentSlug: 'asg',
        submissionSlug: 'sub',
        submissionTitle: 'T',
        reviewer: { id: 'u', email: 'e@test.dev', displayName: 'R' },
        invitedBy: { id: 'e', displayName: 'Ed' },
        acceptUrl: 'http://a',
        declineUrl: 'http://d',
      }),
    );

    expect(nack).toHaveBeenCalledWith(expect.anything(), false);
    expect(reminderHandle).not.toHaveBeenCalled();
    expect(ack).not.toHaveBeenCalled();
  });

  it('nacks when handler throws', async () => {
    reviewerHandle.mockRejectedValueOnce(new Error('boom'));

    await reviewerCb(
      makeConsumeMessage({
        type: 'ReviewerInvited',
        occurredAt: new Date().toISOString(),
        idempotencyKey: 'reviewer_invited:asg',
        assignmentSlug: 'asg',
        submissionSlug: 'sub',
        submissionTitle: 'T',
        reviewer: { id: 'u', email: 'e@test.dev', displayName: 'R' },
        invitedBy: { id: 'e', displayName: 'Ed' },
        acceptUrl: 'http://a',
        declineUrl: 'http://d',
      }),
    );

    expect(nack).toHaveBeenCalledWith(expect.anything(), false);
    expect(ack).not.toHaveBeenCalled();
  });

  it('acks when handler returns ack (reviewer queue)', async () => {
    await reviewerCb(
      makeConsumeMessage({
        type: 'ReviewerInvited',
        occurredAt: new Date().toISOString(),
        idempotencyKey: 'reviewer_invited:asg',
        assignmentSlug: 'asg',
        submissionSlug: 'sub',
        submissionTitle: 'T',
        reviewer: { id: 'u', email: 'e@test.dev', displayName: 'R' },
        invitedBy: { id: 'e', displayName: 'Ed' },
        acceptUrl: 'http://a',
        declineUrl: 'http://d',
      }),
    );

    expect(ack).toHaveBeenCalledTimes(1);
    expect(nack).not.toHaveBeenCalled();
    expect(reviewerHandle).toHaveBeenCalledTimes(1);
  });

  it('registers consume for both topology queues', async () => {
    const rabbit = {
      getTopology: jest.fn().mockReturnValue(DEFAULT_TOPOLOGY),
      consume: jest.fn().mockResolvedValue(undefined),
      ack: jest.fn(),
      nack: jest.fn(),
    };
    const mod = await Test.createTestingModule({
      providers: [
        ConsumersService,
        { provide: RabbitMqConnection, useValue: rabbit },
        { provide: ReviewerInvitedHandler, useValue: { handle: jest.fn() } },
        { provide: ReminderDueHandler, useValue: { handle: jest.fn() } },
      ],
    }).compile();
    const fresh = mod.get(ConsumersService);
    await fresh.onModuleInit();
    expect(rabbit.consume).toHaveBeenCalledWith(
      DEFAULT_TOPOLOGY.reviewerInvitedQueue,
      expect.any(Function),
    );
    expect(rabbit.consume).toHaveBeenCalledWith(
      DEFAULT_TOPOLOGY.reminderDueQueue,
      expect.any(Function),
    );
  });
});
