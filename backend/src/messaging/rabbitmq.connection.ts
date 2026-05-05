import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';
import type { Channel, ChannelModel } from 'amqplib';
import { assertTopology, DEFAULT_TOPOLOGY, TopologyNames } from './shared/topology';

/**
 * Thin wrapper around amqplib that owns the single connection + channel
 * for the publisher side. Auto-reconnects with backoff so a broker
 * outage does not crash the API process — outbox rows accumulate and
 * drain once the connection is back.
 *
 * We deliberately do NOT use @nestjs/microservices here: its RMQ
 * transport assumes one queue per service and a request/reply shape,
 * which fights against our topic-exchange + DLX topology (plan §6a).
 */
@Injectable()
export class RabbitMqConnection implements OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqConnection.name);
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private connecting = false;
  private readonly url: string;
  private readonly topology: TopologyNames;

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

  /**
   * Returns a usable channel, creating connection + channel + topology
   * lazily. Throws if the broker is unavailable; callers (the outbox
   * drainer, the publisher) are expected to treat that as transient.
   */
  async getChannel(): Promise<Channel> {
    if (this.channel) return this.channel;
    if (this.connecting) {
      while (this.connecting) await new Promise((r) => setTimeout(r, 50));
      if (this.channel) return this.channel;
    }
    this.connecting = true;
    try {
      const conn = await amqplib.connect(this.url);
      conn.on('error', (err: Error) => {
        this.logger.warn(`AMQP connection error: ${err.message}`);
      });
      conn.on('close', () => {
        this.logger.warn('AMQP connection closed');
        this.connection = null;
        this.channel = null;
      });
      const ch = await conn.createChannel();
      ch.on('error', (err: Error) => {
        this.logger.warn(`AMQP channel error: ${err.message}`);
      });
      ch.on('close', () => {
        this.logger.warn('AMQP channel closed');
        this.channel = null;
      });
      await assertTopology(ch, this.topology);
      this.connection = conn;
      this.channel = ch;
      this.logger.log(
        `AMQP connected; topology asserted on exchange=${this.topology.exchange}`,
      );
      return ch;
    } finally {
      this.connecting = false;
    }
  }

  async publish(
    routingKey: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const ch = await this.getChannel();
    const buffer = Buffer.from(JSON.stringify(payload));
    const ok = ch.publish(this.topology.exchange, routingKey, buffer, {
      persistent: true,
      contentType: 'application/json',
    });
    if (!ok) {
      await new Promise<void>((resolve) => ch.once('drain', () => resolve()));
    }
  }

  async onModuleDestroy(): Promise<void> {
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
