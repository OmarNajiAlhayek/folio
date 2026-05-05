import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { EmailLog } from '../email-log/email-log.entity';
import { Reminder } from '../reminders/reminder.entity';
import { TemplatesModule } from '../templates/templates.module';
import { ProvidersModule } from '../providers/providers.module';
import { ReviewerInvitedHandler } from './reviewer-invited.handler';
import { ReminderDueHandler } from './reminder-due.handler';
import { ConsumersService } from './consumers.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([EmailLog, Reminder]),
    TemplatesModule,
    ProvidersModule,
  ],
  providers: [ReviewerInvitedHandler, ReminderDueHandler, ConsumersService],
  exports: [ReviewerInvitedHandler, ReminderDueHandler],
})
export class HandlersModule {}
