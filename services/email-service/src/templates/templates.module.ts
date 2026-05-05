import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailReminderPolicyEntity } from '../entities/email-reminder-policy.entity';
import { EmailTemplateEntity } from '../entities/email-template.entity';
import { ReminderPolicyService } from '../policy/reminder-policy.service';
import { TemplatesService } from './templates.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmailTemplateEntity, EmailReminderPolicyEntity]),
  ],
  providers: [TemplatesService, ReminderPolicyService],
  exports: [TemplatesService, ReminderPolicyService],
})
export class TemplatesModule {}
