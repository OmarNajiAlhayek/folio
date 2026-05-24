import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboundEvent } from '../entities/outbound-event.entity';
import { RabbitMqConnection } from './rabbitmq.connection';
import { EventPublisherService } from './event-publisher.service';
import { OutboxDrainerService } from './outbox-drainer.service';
import { OutboxHealthController } from './outbox-health.controller';
import { RabbitMqQueueMetricsService } from './rabbitmq-queue-metrics.service';

@Module({
  imports: [TypeOrmModule.forFeature([OutboundEvent])],
  providers: [
    RabbitMqConnection,
    RabbitMqQueueMetricsService,
    EventPublisherService,
    OutboxDrainerService,
  ],
  controllers: [OutboxHealthController],
  exports: [EventPublisherService, RabbitMqQueueMetricsService],
})
export class MessagingModule {}
