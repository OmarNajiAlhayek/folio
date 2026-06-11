import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { SubmissionUnderReviewHandler } from './submission-under-review.handler';
import { TemplatesService } from '../templates/templates.service';
import {
  EMAIL_PROVIDER_TOKEN,
  EmailProvider,
} from '../providers/email-provider';
import { EmailLog } from '../email-log/email-log.entity';
import { submissionUnderReviewKey } from '@folio/shared/messaging/idempotency';
import type { SubmissionUnderReviewEvent } from '@folio/shared/contracts/email-events';

const LOG_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CYCLE = '2026-06-01T12:00:00.000Z';

function makeEvent(
  override: Partial<SubmissionUnderReviewEvent> = {},
): SubmissionUnderReviewEvent {
  return {
    type: 'SubmissionUnderReview',
    occurredAt: new Date().toISOString(),
    idempotencyKey: submissionUnderReviewKey('paper-one', CYCLE),
    submissionSlug: 'paper-one',
    submissionTitle: 'Title',
    emailLocale: 'en',
    author: { id: 'a1', email: 'a@test.dev', displayName: 'Author' },
    submissionUrl: 'http://localhost/submissions/paper-one',
    submittedCycleAt: CYCLE,
    trigger: 'editor',
    initiatedByDisplayName: 'Editor Example',
    ...override,
  };
}

describe('SubmissionUnderReviewHandler', () => {
  let handler: SubmissionUnderReviewHandler;
  let templates: { render: jest.Mock };
  let mockProvider: jest.Mocked<Pick<EmailProvider, 'send'>>;
  let mockDs: { transaction: jest.Mock; getRepository: jest.Mock };

  beforeEach(async () => {
    mockProvider = {
      send: jest.fn().mockResolvedValue({ messageId: 'mid-1' }),
    };
    templates = {
      render: jest.fn().mockResolvedValue({
        subject: 'Under peer review',
        html: '<p>html</p>',
        text: 'text',
      }),
    };

    const qb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const txLogRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: LOG_ID,
        idempotencyKey: submissionUnderReviewKey('paper-one', CYCLE),
        status: 'pending',
        recipient: 'a@test.dev',
        template: 'submission-under-review',
        context: {},
      }),
      query: jest.fn().mockResolvedValue([{ id: LOG_ID }]),
    };

    const rootLogRepo = {
      createQueryBuilder: jest.fn(() => qb),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const mockManager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === EmailLog) return txLogRepo;
        throw new Error('unexpected entity');
      }),
    };

    mockDs = {
      transaction: jest.fn(async (fn: (manager: unknown) => Promise<unknown>) =>
        fn(mockManager),
      ),
      getRepository: jest.fn((entity: unknown) => {
        if (entity === EmailLog) return rootLogRepo;
        throw new Error('unexpected root entity');
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SubmissionUnderReviewHandler,
        { provide: DataSource, useValue: mockDs },
        { provide: EMAIL_PROVIDER_TOKEN, useValue: mockProvider },
        { provide: TemplatesService, useValue: templates },
      ],
    }).compile();

    handler = moduleRef.get(SubmissionUnderReviewHandler);
  });

  it('rejects bad idempotency key', async () => {
    const outcome = await handler.handle(
      makeEvent({ idempotencyKey: 'wrong-key' }),
    );
    expect(outcome).toEqual({
      kind: 'nack-no-requeue',
      reason: 'bad idempotency key',
    });
    expect(mockProvider.send).not.toHaveBeenCalled();
  });

  it('renders submission-under-review template and sends mail', async () => {
    const outcome = await handler.handle(makeEvent());
    expect(outcome).toEqual({ kind: 'ack' });
    expect(templates.render).toHaveBeenCalledWith(
      'submission-under-review',
      'en',
      expect.objectContaining({
        authorDisplayName: 'Author',
        submissionTitle: 'Title',
        submissionUrl: 'http://localhost/submissions/paper-one',
      }),
    );
    expect(mockProvider.send).toHaveBeenCalled();
  });
});
