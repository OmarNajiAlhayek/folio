import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { ClsModule, ClsService } from 'nestjs-cls';
import {
  folioClsRootOptions,
  folioLoggerUseFactory,
} from '@folio/nest-observability';
import { dataSourceOptions } from './db/data-source';
import { AdminModule } from './admin/admin.module';
import { AmqpModule } from './amqp/amqp.module';
import { HandlersModule } from './handlers/handlers.module';
import { HealthModule } from './health/health.module';
import { RemindersModule } from './reminders/reminders.module';
import { TemplatesModule } from './templates/templates.module';

@Module({
  imports: [
    ClsModule.forRoot(folioClsRootOptions),
    LoggerModule.forRootAsync({
      imports: [ConfigModule, ClsModule],
      inject: [ConfigService, ClsService],
      useFactory: folioLoggerUseFactory('folio-email-service'),
    }),
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot(dataSourceOptions),
    AmqpModule,
    TemplatesModule,
    HandlersModule,
    RemindersModule,
    AdminModule,
    HealthModule,
  ],
})
export class AppModule {}
