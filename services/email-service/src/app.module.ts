import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from './db/data-source';
import { AmqpModule } from './amqp/amqp.module';
import { HandlersModule } from './handlers/handlers.module';
import { RemindersModule } from './reminders/reminders.module';
import { TemplatesModule } from './templates/templates.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot(dataSourceOptions),
    AmqpModule,
    TemplatesModule,
    HandlersModule,
    RemindersModule,
  ],
})
export class AppModule {}
