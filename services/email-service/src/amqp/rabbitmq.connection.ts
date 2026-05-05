import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';
import type { Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import {
  assertTopology,
  DEFAULT_TOPOLOGY,
  TopologyNames,
} from '../shared/topology';

const RECONNECT_DELAY_MS = 5_000;

/**
 * Owns the connection + a single channel for the email-service. Mirrors
 * the backend's wrapper but on the consumer side: it supports
 * `consume(queue, handler)` and re-establishes the connection if the
 * broker drops.
 *
 * `prefetch(1)` keeps the worker fair — one message at a time per
 * queue, which is what we want given that the handler talks to a DB
 * and an SMTP/API provider.
 */
@Injectable()
export class RabbitMqConnection implements OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqConnection.name);
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
        `AMQP connected; topology asserted on exchange=${this.topology.exchange}`,
      );
      for (const sub of this.subscriptions) {
        await this.startConsumer(sub.queue, sub.handler);
      }
    } catch (err) {
      this.logger.error(
        `AMQP connect failed: ${err instanceof Error ? err.message : String(err)}; retrying in ${RECONNECT_DELAY_MS}ms`,
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
            await handler(msg);
          } catch (err) {
            this.logger.error(
              `unhandled consumer error on ${queue}: ${err instanceof Error ? err.message : String(err)}`,
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
    this.logger.log(`consuming queue=${queue}`);
  }

  async publish(
    routingKey: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const ch = this.channel;
    if (!ch) {
      throw new Error('AMQP channel not ready');
    }
    const buffer = Buffer.from(JSON.stringify(payload));
    const ok = ch.publish(this.topology.exchange, routingKey, buffer, {
      persistent: true,
      contentType: 'application/json',
    });
    if (!ok) {
      await new Promise<void>((resolve) => ch.once('drain', () => resolve()));
    }
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
