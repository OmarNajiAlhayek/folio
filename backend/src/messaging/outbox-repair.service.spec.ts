import { ConflictException, NotFoundException } from '@nestjs/common';
import { OutboxRepairService } from './outbox-repair.service';
import type { OutboundEvent } from '../entities/outbound-event.entity';

describe('OutboxRepairService', () => {
  const makeRepo = (row: OutboundEvent | null) => ({
    findOne: jest.fn().mockResolvedValue(row),
    save: jest.fn().mockImplementation(async (r: OutboundEvent) => r),
  });

  it('requeues a dead row', async () => {
    const row = {
      id: 'id-1',
      routingKey: 'reviewer.invited',
      payload: {},
      attempts: 8,
      lastError: 'broker down',
      status: 'dead' as const,
      nextAttemptAt: null,
      publishedAt: null,
      createdAt: new Date(),
    };
    const repo = makeRepo(row);
    const svc = new OutboxRepairService(repo as never);
    const result = await svc.requeueDead('id-1');
    expect(result).toEqual({
      id: 'id-1',
      routingKey: 'reviewer.invited',
      status: 'pending',
    });
    expect(row.status).toBe('pending');
    expect(row.attempts).toBe(0);
    expect(row.lastError).toBeNull();
    expect(repo.save).toHaveBeenCalled();
  });

  it('throws when row is missing', async () => {
    const svc = new OutboxRepairService(makeRepo(null) as never);
    await expect(svc.requeueDead('missing')).rejects.toThrow(NotFoundException);
  });

  it('throws when row is not dead', async () => {
    const row = {
      id: 'id-2',
      routingKey: 'reviewer.invited',
      payload: {},
      attempts: 1,
      lastError: null,
      status: 'pending' as const,
      nextAttemptAt: new Date(),
      publishedAt: null,
      createdAt: new Date(),
    };
    const svc = new OutboxRepairService(makeRepo(row) as never);
    await expect(svc.requeueDead('id-2')).rejects.toThrow(ConflictException);
  });
});
