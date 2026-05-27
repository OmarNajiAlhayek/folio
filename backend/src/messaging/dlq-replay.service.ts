import { Injectable, Logger } from '@nestjs/common';
import { RabbitMqConnection } from './rabbitmq.connection';
import { routingKeyFromDlqMessage } from './dlq-routing.util';

export type DlqReplayItemResult = {
  routingKey: string;
  replayed: boolean;
  error?: string;
};

export type DlqReplayBatchResult = {
  requested: number;
  replayed: number;
  empty: boolean;
  items: DlqReplayItemResult[];
};

const MAX_BATCH = 25;

/**
 * Operator recovery: pull messages from `folio.events.dlq` and republish
 * to the main exchange with the original routing key.
 */
@Injectable()
export class DlqReplayService {
  private readonly logger = new Logger(DlqReplayService.name);

  constructor(private readonly rabbit: RabbitMqConnection) {}

  async replayBatch(limitRaw?: number): Promise<DlqReplayBatchResult> {
    const limit = Math.min(
      MAX_BATCH,
      Math.max(1, limitRaw ?? 1),
    );
    const items: DlqReplayItemResult[] = [];
    let replayed = 0;

    for (let i = 0; i < limit; i++) {
      const one = await this.replayOne();
      if (one.empty) {
        return {
          requested: limit,
          replayed,
          empty: items.length === 0,
          items,
        };
      }
      items.push(one.item);
      if (one.item.replayed) {
        replayed += 1;
      }
    }

    return {
      requested: limit,
      replayed,
      empty: false,
      items,
    };
  }

  private async replayOne(): Promise<
    | { empty: true }
    | { empty: false; item: DlqReplayItemResult }
  > {
    const msg = await this.rabbit.getFromDlq();
    if (!msg) {
      return { empty: true };
    }

    const routingKey = routingKeyFromDlqMessage(msg);
    if (!routingKey) {
      await this.rabbit.ackGetMessage(msg);
      const item: DlqReplayItemResult = {
        routingKey: msg.fields.routingKey ?? 'unknown',
        replayed: false,
        error: 'Could not determine routing key; message removed from DLQ',
      };
      this.logger.warn(
        `dlq.replay skipped unparseable message rk=${msg.fields.routingKey}`,
      );
      return { empty: false, item };
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(msg.content.toString('utf8')) as Record<
        string,
        unknown
      >;
    } catch {
      await this.rabbit.ackGetMessage(msg);
      return {
        empty: false,
        item: {
          routingKey,
          replayed: false,
          error: 'Invalid JSON body; message removed from DLQ',
        },
      };
    }

    try {
      await this.rabbit.publish(routingKey, payload);
      await this.rabbit.ackGetMessage(msg);
      this.logger.log(`dlq.replay ok routing=${routingKey}`);
      return {
        empty: false,
        item: { routingKey, replayed: true },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.rabbit.nackGetMessage(msg, true);
      return {
        empty: false,
        item: { routingKey, replayed: false, error: message.slice(0, 500) },
      };
    }
  }
}
