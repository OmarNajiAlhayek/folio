import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OutboxDrainerService } from './outbox-drainer.service';
import { OutboundEvent } from '../entities/outbound-event.entity';
import { RabbitMqConnection } from './rabbitmq.connection';

describe('OutboxDrainerService', () => {
  let service: OutboxDrainerService;
  let find: jest.Mock;
  let save: jest.Mock;
  let publish: jest.Mock;

  beforeEach(async () => {
    find = jest.fn().mockResolvedValue([]);
    save = jest.fn().mockImplementation(async (row: OutboundEvent) => row);
    publish = jest.fn().mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxDrainerService,
        {
          provide: getRepositoryToken(OutboundEvent),
          useValue: { find, save },
        },
        {
          provide: RabbitMqConnection,
          useValue: { publish },
        },
      ],
    }).compile();

    service = moduleRef.get(OutboxDrainerService);
  });

  it('tick publishes pending rows and marks published', async () => {
    const row: OutboundEvent = {
      id: 'rid',
      routingKey: 'reviewer.invited',
      payload: { type: 'ReviewerInvited' },
      attempts: 0,
      lastError: null,
      status: 'pending',
      nextAttemptAt: null,
      publishedAt: null,
      createdAt: new Date(),
    };
    find.mockResolvedValueOnce([row]);

    await service.tick();

    expect(publish).toHaveBeenCalledWith(
      'reviewer.invited',
      row.payload,
    );
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'published',
        publishedAt: expect.any(Date) as Date,
        lastError: null,
      }),
    );
  });

  it('tick retries on publish failure with backoff and dead after cap', async () => {
    const row: OutboundEvent = {
      id: 'rid2',
      routingKey: 'reviewer.invited',
      payload: {},
      attempts: 0,
      lastError: null,
      status: 'pending',
      nextAttemptAt: null,
      publishedAt: null,
      createdAt: new Date(),
    };
    find.mockResolvedValueOnce([row]);
    publish.mockRejectedValueOnce(new Error('amqp down'));

    await service.tick();

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        attempts: 1,
        status: 'pending',
        lastError: expect.stringContaining('amqp down') as unknown as string,
        nextAttemptAt: expect.any(Date) as Date,
      }),
    );
  });

  it('tick marks dead when attempts reach max after failure', async () => {
    const row: OutboundEvent = {
      id: 'rid3',
      routingKey: 'reviewer.invited',
      payload: {},
      attempts: 7,
      lastError: 'prev',
      status: 'pending',
      nextAttemptAt: null,
      publishedAt: null,
      createdAt: new Date(),
    };
    find.mockResolvedValueOnce([row]);
    publish.mockRejectedValueOnce(new Error('still down'));

    await service.tick();

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        attempts: 8,
        status: 'dead',
        nextAttemptAt: null,
      }),
    );
  });

  it('tick does not publish when there are no due rows', async () => {
    find.mockResolvedValueOnce([]);
    await service.tick();
    expect(publish).not.toHaveBeenCalled();
  });

  it('ignores overlapping tick while a drain is in progress', async () => {
    let resolveFind!: (rows: OutboundEvent[]) => void;
    const findPromise = new Promise<OutboundEvent[]>((resolve) => {
      resolveFind = resolve;
    });
    find.mockImplementationOnce(() => findPromise);

    const row: OutboundEvent = {
      id: 'rid-re',
      routingKey: 'reviewer.invited',
      payload: {},
      attempts: 0,
      lastError: null,
      status: 'pending',
      nextAttemptAt: null,
      publishedAt: null,
      createdAt: new Date(),
    };

    const first = service.tick();
    await Promise.resolve();
    await service.tick();
    expect(find).toHaveBeenCalledTimes(1);
    expect(publish).not.toHaveBeenCalled();
    resolveFind([row]);
    await first;
    expect(publish).toHaveBeenCalledTimes(1);
  });
});
