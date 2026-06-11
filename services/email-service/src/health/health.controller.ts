import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RabbitMqConnection } from '../amqp/rabbitmq.connection';

@Controller()
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly rabbit: RabbitMqConnection,
  ) {}

  @Get('health')
  async health() {
    return this.probe();
  }

  @Get('ready')
  async ready() {
    const result = await this.probe();
    if (result.status !== 'ok') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }

  private async probe(): Promise<{
    status: 'ok' | 'degraded';
    checks: Record<string, boolean>;
  }> {
    let dbOk = false;
    try {
      await this.dataSource.query('SELECT 1');
      dbOk = true;
    } catch {
      dbOk = false;
    }
    const amqpOk = this.rabbit.isConnected();
    const ok = dbOk && amqpOk;
    return {
      status: ok ? 'ok' : 'degraded',
      checks: { database: dbOk, amqp: amqpOk },
    };
  }
}
