import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboundEvent } from '../entities/outbound-event.entity';
import { RabbitMqConnection } from './rabbitmq.connection';
import { EventPublisherService } from './event-publisher.service';
import { OutboxDrainerService } from './outbox-drainer.service';
import { OutboxHealthController } from './outbox-health.controller';
import { OutboxRepairService } from './outbox-repair.service';
import { DlqReplayService } from './dlq-replay.service';
import { RabbitMqQueueMetricsService } from './rabbitmq-queue-metrics.service';

@Module({
  imports: [TypeOrmModule.forFeature([OutboundEvent])],
  providers: [
    RabbitMqConnection,
    RabbitMqQueueMetricsService,
    EventPublisherService,
    OutboxDrainerService,
    OutboxRepairService,
    DlqReplayService,
  ],
  controllers: [OutboxHealthController],
  exports: [
    EventPublisherService,
    RabbitMqQueueMetricsService,
    OutboxRepairService,
    DlqReplayService,
  ],
})
export class MessagingModule {}
