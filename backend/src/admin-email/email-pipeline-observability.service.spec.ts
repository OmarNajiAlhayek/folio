import { EmailServiceClient } from '../email-client/email-client.service';
import { EmailPipelineObservabilityService } from './email-pipeline-observability.service';
import { RabbitMqQueueMetricsService } from '../messaging/rabbitmq-queue-metrics.service';

describe('EmailPipelineObservabilityService', () => {
  const rabbitMetrics: jest.Mocked<
    Pick<RabbitMqQueueMetricsService, 'getCachedMetrics'>
  > = {
    getCachedMetrics: jest.fn(),
  };

  const emailClient: jest.Mocked<Pick<EmailServiceClient, 'getPipelineSlice'>> =
    {
      getPipelineSlice: jest.fn(),
    };

  const makeService = (outboxRepo: {
    count: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    createQueryBuilder: jest.Mock;
  }) =>
    new EmailPipelineObservabilityService(
      outboxRepo as never,
      rabbitMetrics as unknown as RabbitMqQueueMetricsService,
      emailClient as unknown as EmailServiceClient,
    );

  beforeEach(() => {
    rabbitMetrics.getCachedMetrics.mockResolvedValue({
      metricsAvailable: true,
      cachedAt: '2026-01-01T00:00:00.000Z',
      staleAfterSeconds: 20,
      available: true,
      queues: {
        'folio.events.dlq': { messageCount: 0, consumerCount: 0 },
        'email.reviewer_invited': { messageCount: 1, consumerCount: 1 },
        'email.reminder_due': { messageCount: 0, consumerCount: 1 },
      },
    });
    emailClient.getPipelineSlice.mockResolvedValue({
      emailLog: {
        counts: { pending: 1, sent: 5, failed: 2 },
        failedSample: [
          {
            id: 'f1',
            idempotencyKey: 'reviewer_invited:asg-1',
            template: 'reviewer-invited',
            createdAt: '2026-05-03T00:00:00.000Z',
            errorRedacted: 'SMTP [host] timeout',
          },
        ],
      },
      reminders: {
        counts: { pending: 4, sent: 10, cancelled: 1 },
        stuckPendingPastDue: 0,
      },
    });
  });

  it('aggregates outbox, email client slice, and rabbitMq', async () => {
    const outboxRepo = {
      count: jest
        .fn()
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(100),
      findOne: jest.fn().mockResolvedValue({
        id: 'o1',
        routingKey: 'reviewer.invited',
        attempts: 0,
        createdAt: new Date('2026-05-01T12:00:00.000Z'),
      }),
      find: jest.fn().mockResolvedValue([
        {
          id: 'd1',
          routingKey: 'reviewer.invited',
          attempts: 10,
          createdAt: new Date('2026-05-02T12:00:00.000Z'),
          lastError:
            'Error: connect ECONNREFUSED smtp.internal.example.com:587',
        },
      ]),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(2),
      }),
    };

    const svc = makeService(outboxRepo);
    const res = await svc.getPipelineStatus();

    expect(res.outbox.pending).toBe(3);
    expect(res.outbox.dead).toBe(1);
    expect(res.outbox.published).toBe(100);
    expect(res.outbox.dueNow).toBe(2);
    expect(res.outbox.deadSample[0].lastErrorRedacted).toContain('[host]');
    expect(res.emailLog.counts.failed).toBe(2);
    expect(res.emailLog.failedSample[0].errorRedacted).toBeDefined();
    expect(res.reminders.counts.pending).toBe(4);
    expect(res.reminders.stuckPendingPastDue).toBe(0);
    expect(res.rabbitMq.available).toBe(true);
    expect(emailClient.getPipelineSlice).toHaveBeenCalled();
  });
});
