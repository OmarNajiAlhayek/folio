import { Global, Module } from '@nestjs/common';
import { RabbitMqConnection } from './rabbitmq.connection';

@Global()
@Module({
  providers: [RabbitMqConnection],
  exports: [RabbitMqConnection],
})
export class AmqpModule {}
