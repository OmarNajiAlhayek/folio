import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { OutboxDrainerService } from './outbox-drainer.service';
import { OutboundEvent } from '../entities/outbound-event.entity';
import { RabbitMqConnection } from './rabbitmq.connection';

function outboxRow(over: Partial<OutboundEvent> = {}): OutboundEvent {
  return {
    id: 'rid',
    routingKey: 'reviewer.invited',
    payload: { type: 'ReviewerInvited' },
    attempts: 0,
    lastError: null,
    status: 'pending',
    nextAttemptAt: null,
    claimedAt: new Date(),
    publishedAt: null,
    createdAt: new Date(),
    ...over,
  };
}

describe('OutboxDrainerService', () => {
  let service: OutboxDrainerService;
  let query: jest.Mock;
  let save: jest.Mock;
  let publish: jest.Mock;

  beforeEach(async () => {
    query = jest.fn().mockResolvedValue([]);
    save = jest.fn().mockImplementation(async (row: OutboundEvent) => row);
    publish = jest.fn().mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxDrainerService,
        {
          provide: getRepositoryToken(OutboundEvent),
          useValue: { save },
        },
        {
          provide: DataSource,
          useValue: { query },
        },
        {
          provide: RabbitMqConnection,
          useValue: { publish },
        },
      ],
    }).compile();

    service = moduleRef.get(OutboxDrainerService);
  });

  it('tick claims with SKIP LOCKED and publishes pending rows', async () => {
    const row = outboxRow();
    const pgRow = {
      id: row.id,
      routing_key: row.routingKey,
      payload: row.payload,
      attempts: row.attempts,
      last_error: row.lastError,
      status: row.status,
      next_attempt_at: row.nextAttemptAt,
      claimed_at: row.claimedAt,
      published_at: row.publishedAt,
      created_at: row.createdAt,
    };
    query.mockResolvedValueOnce([pgRow]);

    await service.tick();

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE SKIP LOCKED'),
      expect.any(Array),
    );
    expect(publish).toHaveBeenCalledWith('reviewer.invited', row.payload);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'published',
        publishedAt: expect.any(Date) as Date,
        claimedAt: null,
      }),
    );
  });

  it('unwraps TypeORM Postgres UPDATE result tuple [rows, rowCount]', async () => {
    const row = outboxRow();
    const pgRow = {
      id: row.id,
      routing_key: row.routingKey,
      payload: row.payload,
      attempts: row.attempts,
      last_error: row.lastError,
      status: row.status,
      next_attempt_at: row.nextAttemptAt,
      claimed_at: row.claimedAt,
      published_at: row.publishedAt,
      created_at: row.createdAt,
    };
    query.mockResolvedValueOnce([[pgRow], 1]);

    await service.tick();

    expect(publish).toHaveBeenCalledWith('reviewer.invited', row.payload);
  });

  it('tick retries on publish failure with backoff and dead after cap', async () => {
    const row = outboxRow({ attempts: 7 });
    query.mockResolvedValueOnce([
      {
        id: row.id,
        routing_key: row.routingKey,
        payload: row.payload,
        attempts: row.attempts,
        last_error: 'prev',
        status: row.status,
        next_attempt_at: row.nextAttemptAt,
        claimed_at: row.claimedAt,
        published_at: row.publishedAt,
        created_at: row.createdAt,
      },
    ]);
    publish.mockRejectedValueOnce(new Error('still down'));

    await service.tick();

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        attempts: 8,
        status: 'dead',
        claimedAt: null,
      }),
    );
  });

  it('ignores overlapping tick while a drain is in progress', async () => {
    let resolveQuery!: (rows: unknown[]) => void;
    const queryPromise = new Promise<unknown[]>((resolve) => {
      resolveQuery = resolve;
    });
    query.mockImplementationOnce(() => queryPromise);

    const first = service.tick();
    await Promise.resolve();
    await service.tick();
    expect(query).toHaveBeenCalledTimes(1);

    resolveQuery([]);
    await first;
  });
});
