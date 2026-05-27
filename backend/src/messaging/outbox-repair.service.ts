import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutboundEvent } from '../entities/outbound-event.entity';

export type RequeuedOutboxRow = {
  id: string;
  routingKey: string;
  status: 'pending';
};

/**
 * Operator recovery for rows the drainer marked `dead` after broker retries
 * were exhausted. Resets the row so the scheduled drainer can publish again.
 */
@Injectable()
export class OutboxRepairService {
  constructor(
    @InjectRepository(OutboundEvent)
    private readonly outboxRepo: Repository<OutboundEvent>,
  ) {}

  async requeueDead(id: string): Promise<RequeuedOutboxRow> {
    const row = await this.outboxRepo.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException({
        message: 'Outbox row not found',
        code: 'OUTBOX_NOT_FOUND',
      });
    }
    if (row.status !== 'dead') {
      throw new ConflictException({
        message: `Outbox row status is "${row.status}"; only dead rows can be requeued`,
        code: 'OUTBOX_NOT_REQUEUEABLE',
      });
    }

    row.status = 'pending';
    row.attempts = 0;
    row.nextAttemptAt = null;
    row.lastError = null;
    row.publishedAt = null;
    row.claimedAt = null;
    await this.outboxRepo.save(row);

    return {
      id: row.id,
      routingKey: row.routingKey,
      status: 'pending',
    };
  }
}
