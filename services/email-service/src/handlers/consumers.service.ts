import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ConsumeMessage } from 'amqplib';
import { RabbitMqConnection } from '../amqp/rabbitmq.connection';
import {
  FolioEvent,
  ReminderDueEvent,
  ReviewerInvitedEvent,
  ROUTING_KEY,
} from '../contracts/email-events';
import { redactEventPayload } from '../shared/redactor';
import { ReviewerInvitedHandler } from './reviewer-invited.handler';
import { ReminderDueHandler } from './reminder-due.handler';
import { HandlerOutcome } from './handler-result';

/**
 * Wires queue subscriptions to the right typed handler. Owns the
 * ack/nack decision based on the handler's `HandlerOutcome` so the
 * pure state-machine code never imports amqplib.
 */
@Injectable()
export class ConsumersService implements OnModuleInit {
  private readonly logger = new Logger(ConsumersService.name);

  constructor(
    private readonly rabbit: RabbitMqConnection,
    private readonly reviewerInvited: ReviewerInvitedHandler,
    private readonly reminderDue: ReminderDueHandler,
  ) {}

  async onModuleInit(): Promise<void> {
    const topology = this.rabbit.getTopology();

    await this.rabbit.consume(topology.reviewerInvitedQueue, (msg) =>
      this.dispatch(msg, ROUTING_KEY.reviewerInvited),
    );
    await this.rabbit.consume(topology.reminderDueQueue, (msg) =>
      this.dispatch(msg, ROUTING_KEY.reminderDue),
    );
  }

  private async dispatch(
    msg: ConsumeMessage,
    routingKey: string,
  ): Promise<void> {
    let event: FolioEvent;
    try {
      event = JSON.parse(msg.content.toString('utf8')) as FolioEvent;
    } catch (err) {
      this.logger.warn(
        `unparseable message routingKey=${routingKey}: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.rabbit.nack(msg, false);
      return;
    }
    this.logger.debug(
      `received routingKey=${routingKey} ${JSON.stringify(redactEventPayload(event))}`,
    );

    let outcome: HandlerOutcome;
    try {
      if (
        routingKey === ROUTING_KEY.reviewerInvited &&
        event.type === 'ReviewerInvited'
      ) {
        outcome = await this.reviewerInvited.handle(
          event as ReviewerInvitedEvent,
        );
      } else if (
        routingKey === ROUTING_KEY.reminderDue &&
        event.type === 'ReminderDue'
      ) {
        outcome = await this.reminderDue.handle(event as ReminderDueEvent);
      } else {
        outcome = {
          kind: 'nack-no-requeue',
          reason: `routing key / event type mismatch ${routingKey}/${event.type}`,
        };
      }
    } catch (err) {
      this.logger.error(
        `handler crashed routingKey=${routingKey}: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.rabbit.nack(msg, false);
      return;
    }

    if (outcome.kind === 'ack') {
      this.rabbit.ack(msg);
    } else {
      this.logger.warn(
        `dead-letter routingKey=${routingKey} reason=${outcome.reason}`,
      );
      this.rabbit.nack(msg, false);
    }
  }
}
