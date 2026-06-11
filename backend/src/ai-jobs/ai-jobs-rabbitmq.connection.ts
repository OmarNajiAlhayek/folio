import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';
import type { Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import { withAmqpConsumerContext } from '@folio/shared/observability';
import {
  assertTopology,
  DEFAULT_TOPOLOGY,
  TopologyNames,
} from '../messaging/shared/topology';

const RECONNECT_DELAY_MS = 5_000;

/**
 * Dedicated AMQP connection for AI job consumers. Separate from the
 * publisher connection in MessagingModule so publish and consume do not
 * share a single channel lifecycle.
 */
@Injectable()
export class AiJobsRabbitMqConnection implements OnModuleDestroy {
  private readonly logger = new Logger(AiJobsRabbitMqConnection.name);
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private destroyed = false;
  private readonly url: string;
  private readonly topology: TopologyNames;
  private readonly subscriptions: Array<{
    queue: string;
    handler: (msg: ConsumeMessage) => Promise<void>;
  }> = [];

  constructor(config: ConfigService) {
    this.url = config.get<string>('RABBITMQ_URL', 'amqp://localhost:5672');
    const exchange = config.get<string>(
      'RABBITMQ_EXCHANGE',
      DEFAULT_TOPOLOGY.exchange,
    );
    this.topology = { ...DEFAULT_TOPOLOGY, exchange };
  }

  getTopology(): TopologyNames {
    return this.topology;
  }

  isConnected(): boolean {
    return this.channel !== null;
  }

  async connect(): Promise<void> {
    if (this.destroyed) return;
    try {
      const conn = await amqplib.connect(this.url);
      conn.on('error', (err: Error) => {
        this.logger.warn(`AMQP connection error: ${err.message}`);
      });
      conn.on('close', () => {
        this.logger.warn('AMQP connection closed; will reconnect');
        this.connection = null;
        this.channel = null;
        if (!this.destroyed) {
          setTimeout(() => void this.connect(), RECONNECT_DELAY_MS);
        }
      });
      const ch = await conn.createChannel();
      ch.on('error', (err: Error) => {
        this.logger.warn(`AMQP channel error: ${err.message}`);
      });
      ch.on('close', () => {
        this.logger.warn('AMQP channel closed');
        this.channel = null;
      });
      await ch.prefetch(1);
      await assertTopology(ch, this.topology);
      this.connection = conn;
      this.channel = ch;
      this.logger.log(
        `AI jobs AMQP connected; topology asserted on exchange=${this.topology.exchange}`,
      );
      for (const sub of this.subscriptions) {
        await this.startConsumer(sub.queue, sub.handler);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `AI jobs AMQP connect failed (${this.url}): ${message}; retrying in ${RECONNECT_DELAY_MS}ms`,
      );
      if (!this.destroyed) {
        setTimeout(() => void this.connect(), RECONNECT_DELAY_MS);
      }
    }
  }

  async consume(
    queue: string,
    handler: (msg: ConsumeMessage) => Promise<void>,
  ): Promise<void> {
    this.subscriptions.push({ queue, handler });
    if (this.channel) {
      await this.startConsumer(queue, handler);
    }
  }

  private async startConsumer(
    queue: string,
    handler: (msg: ConsumeMessage) => Promise<void>,
  ): Promise<void> {
    const ch = this.channel;
    if (!ch) return;
    await ch.consume(
      queue,
      (msg) => {
        if (!msg) return;
        void (async () => {
          try {
            await withAmqpConsumerContext(
              msg.properties.headers as Record<string, unknown> | undefined,
              { queue, operation: 'ai.job' },
              () => handler(msg),
            );
          } catch (err) {
            this.logger.error(
              `unhandled AI job consumer error on ${queue}: ${err instanceof Error ? err.message : String(err)}`,
            );
            try {
              ch.nack(msg, false, false);
            } catch {
              /* channel may already be closed */
            }
          }
        })();
      },
      { noAck: false },
    );
    this.logger.log(`AI jobs consuming queue=${queue}`);
  }

  ack(msg: ConsumeMessage): void {
    this.channel?.ack(msg);
  }

  nack(msg: ConsumeMessage, requeue: boolean): void {
    this.channel?.nack(msg, false, requeue);
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true;
    try {
      await this.channel?.close();
    } catch {
      /* ignore */
    }
    try {
      await this.connection?.close();
    } catch {
      /* ignore */
    }
  }
}
