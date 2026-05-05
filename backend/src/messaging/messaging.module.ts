import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboundEvent } from '../entities/outbound-event.entity';
import { RabbitMqConnection } from './rabbitmq.connection';
import { EventPublisherService } from './event-publisher.service';
import { OutboxDrainerService } from './outbox-drainer.service';
import { OutboxHealthController } from './outbox-health.controller';

@Module({
  imports: [TypeOrmModule.forFeature([OutboundEvent])],
  providers: [RabbitMqConnection, EventPublisherService, OutboxDrainerService],
  controllers: [OutboxHealthController],
  exports: [EventPublisherService],
})
export class MessagingModule {}
