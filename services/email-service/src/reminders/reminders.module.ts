import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reminder } from './reminder.entity';
import { RemindersScheduler } from './reminders.scheduler';

@Module({
  imports: [TypeOrmModule.forFeature([Reminder])],
  providers: [RemindersScheduler],
})
export class RemindersModule {}
