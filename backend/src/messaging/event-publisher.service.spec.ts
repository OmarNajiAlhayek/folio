import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { EventPublisherService } from './event-publisher.service';
import { OutboundEvent } from '../entities/outbound-event.entity';

describe('EventPublisherService', () => {
  it('enqueue saves pending outbox row', async () => {
    const save = jest.fn().mockImplementation(async (row: OutboundEvent) => row);
    const create = jest.fn((x: Partial<OutboundEvent>) => ({
      ...x,
      id: 'new-id',
    }));

    const moduleRef = await Test.createTestingModule({
      providers: [
        EventPublisherService,
        {
          provide: getRepositoryToken(OutboundEvent),
          useValue: { create, save },
        },
      ],
    }).compile();

    const svc = moduleRef.get(EventPublisherService);
    await svc.enqueue('reviewer.invited', { hello: 'world' });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        routingKey: 'reviewer.invited',
        payload: { hello: 'world' },
        status: 'pending',
        attempts: 0,
        nextAttemptAt: null,
      }),
    );
    expect(save).toHaveBeenCalled();
  });

  it('enqueue uses transactional repository when EntityManager is provided', async () => {
    const rootSave = jest.fn();
    const rootCreate = jest.fn();
    const txSave = jest.fn().mockImplementation(async (row: OutboundEvent) => row);
    const txCreate = jest.fn((x: Partial<OutboundEvent>) => ({
      ...x,
      id: 'tx-id',
    }));

    const manager = {
      getRepository: jest.fn(() => ({
        create: txCreate,
        save: txSave,
      })),
    } as unknown as EntityManager;

    const moduleRef = await Test.createTestingModule({
      providers: [
        EventPublisherService,
        {
          provide: getRepositoryToken(OutboundEvent),
          useValue: { create: rootCreate, save: rootSave },
        },
      ],
    }).compile();

    const svc = moduleRef.get(EventPublisherService);
    await svc.enqueue('reviewer.invited', { hello: 'world' }, manager);

    expect(manager.getRepository).toHaveBeenCalledWith(OutboundEvent);
    expect(txCreate).toHaveBeenCalled();
    expect(txSave).toHaveBeenCalled();
    expect(rootCreate).not.toHaveBeenCalled();
    expect(rootSave).not.toHaveBeenCalled();
  });
});
