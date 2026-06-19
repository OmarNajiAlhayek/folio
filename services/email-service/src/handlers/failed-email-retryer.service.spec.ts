import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { FailedEmailRetryerService } from './failed-email-retryer.service';
import {
  EMAIL_PROVIDER_TOKEN,
  EmailProvider,
} from '../providers/email-provider';
import { Reminder } from '../reminders/reminder.entity';
import {
  MAX_RETRY_COUNT,
  RETRY_DELAY_MS,
} from '../common/email-retry.constants';

const ROW_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const REMINDER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

function makeClaimedRow(
  over: Partial<{
    id: string;
    recipient: string;
    rendered_subject: string;
    rendered_html: string;
    rendered_text: string;
    retry_count: number;
    reminder_id: string | null;
  }> = {},
) {
  return {
    id: ROW_ID,
    recipient: 'r@test.dev',
    rendered_subject: 'Subject',
    rendered_html: '<p>Hi</p>',
    rendered_text: 'Hi',
    retry_count: 0,
    reminder_id: null,
    ...over,
  };
}

describe('FailedEmailRetryerService', () => {
  let service: FailedEmailRetryerService;
  let mockProvider: jest.Mocked<Pick<EmailProvider, 'send'>>;
  let mockQuery: jest.Mock;
  let mockTransaction: jest.Mock;
  let txManager: {
    query: jest.Mock;
    getRepository: jest.Mock;
  };

  beforeEach(async () => {
    mockProvider = {
      send: jest.fn().mockResolvedValue({ messageId: 'retry-mid' }),
    };

    txManager = {
      query: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn(() => ({
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      })),
    };

    mockTransaction = jest.fn(
      async (fn: (m: typeof txManager) => Promise<void>) => fn(txManager),
    );

    mockQuery = jest.fn().mockResolvedValue([]);

    const mockDs = {
      query: mockQuery,
      transaction: mockTransaction,
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        FailedEmailRetryerService,
        { provide: DataSource, useValue: mockDs },
        { provide: EMAIL_PROVIDER_TOKEN, useValue: mockProvider },
      ],
    }).compile();

    service = moduleRef.get(FailedEmailRetryerService);
  });

  it('does nothing when no rows are due', async () => {
    await service.tick();
    expect(mockProvider.send).not.toHaveBeenCalled();
  });

  it('resends using stored rendered content and marks sent on success', async () => {
    const row = makeClaimedRow();
    mockQuery.mockResolvedValueOnce([row]);

    await service.tick();

    expect(mockProvider.send).toHaveBeenCalledWith({
      to: 'r@test.dev',
      subject: 'Subject',
      html: '<p>Hi</p>',
      text: 'Hi',
    });
    expect(mockTransaction).toHaveBeenCalled();
    expect(txManager.query).toHaveBeenCalledWith(
      expect.stringContaining(`"status" = 'sent'`),
      ['retry-mid', ROW_ID],
    );
  });

  it('marks reminder sent when context carries reminderId', async () => {
    const reminderUpdate = jest.fn().mockResolvedValue({ affected: 1 });
    txManager.getRepository.mockReturnValue({ update: reminderUpdate });
    mockQuery.mockResolvedValueOnce([
      makeClaimedRow({ reminder_id: REMINDER_ID }),
    ]);

    await service.tick();

    expect(reminderUpdate).toHaveBeenCalledWith(
      { id: REMINDER_ID },
      expect.objectContaining({ status: 'sent' }),
    );
    expect(txManager.getRepository).toHaveBeenCalledWith(Reminder);
  });

  it('schedules next backoff on transient retry failure', async () => {
    const row = makeClaimedRow({ retry_count: 1 });
    mockQuery.mockResolvedValueOnce([row]).mockResolvedValueOnce(undefined);
    mockProvider.send.mockRejectedValueOnce(new Error('smtp timeout'));

    const before = Date.now();
    await service.tick();

    expect(mockQuery).toHaveBeenLastCalledWith(
      expect.stringContaining('"retry_count"'),
      [2, expect.any(Date), 'smtp timeout', ROW_ID],
    );
    const nextRetryAt = mockQuery.mock.calls[1]?.[1]?.[1] as Date;
    expect(nextRetryAt.getTime()).toBeGreaterThanOrEqual(
      before + RETRY_DELAY_MS[2] - 1000,
    );
  });

  it('stops retrying after max attempts on transient failure', async () => {
    const row = makeClaimedRow({ retry_count: MAX_RETRY_COUNT - 1 });
    mockQuery.mockResolvedValueOnce([row]).mockResolvedValueOnce(undefined);
    mockProvider.send.mockRejectedValueOnce(new Error('smtp timeout'));

    await service.tick();

    expect(mockQuery).toHaveBeenLastCalledWith(
      expect.stringContaining('"retry_count"'),
      [MAX_RETRY_COUNT, null, expect.any(String), ROW_ID],
    );
  });

  it('does not schedule retry on permanent failure', async () => {
    const row = makeClaimedRow({ retry_count: 0 });
    mockQuery.mockResolvedValueOnce([row]).mockResolvedValueOnce(undefined);
    mockProvider.send.mockRejectedValueOnce(
      new Error('550 mailbox unavailable'),
    );

    await service.tick();

    expect(mockQuery).toHaveBeenLastCalledWith(
      expect.stringContaining('"retry_count"'),
      [1, null, expect.stringContaining('550'), ROW_ID],
    );
  });

  it('skips overlapping ticks while a run is in progress', async () => {
    let resolveSend!: () => void;
    const sendGate = new Promise<void>((r) => {
      resolveSend = r;
    });
    mockQuery.mockResolvedValueOnce([makeClaimedRow()]);
    mockProvider.send.mockImplementation(async () => {
      await sendGate;
      return { messageId: 'mid' };
    });

    const first = service.tick();
    const second = service.tick();
    resolveSend();
    await Promise.all([first, second]);

    expect(mockProvider.send).toHaveBeenCalledTimes(1);
  });
});
