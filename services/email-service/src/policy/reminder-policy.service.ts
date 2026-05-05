import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailReminderPolicyEntity } from '../entities/email-reminder-policy.entity';

/**
 * Global reminder cadence from `email.email_reminder_policy` (singleton row id=1).
 * Env `REVIEW_DUE_IN_DAYS` is fallback when the row is missing.
 */
@Injectable()
export class ReminderPolicyService {
  constructor(
    @InjectRepository(EmailReminderPolicyEntity)
    private readonly policyRepo: Repository<EmailReminderPolicyEntity>,
    private readonly config: ConfigService,
  ) {}

  async getDueOffsetsMs(): Promise<{ dueSoonMs: number; overdueMs: number }> {
    const row = await this.policyRepo.findOne({ where: { id: 1 } });
    let dueInDays =
      row?.reviewDueInDays ??
      parseInt(this.config.get<string>('REVIEW_DUE_IN_DAYS', '21') ?? '21', 10);
    if (!Number.isFinite(dueInDays) || dueInDays <= 3) {
      dueInDays = 21;
    }
    const day = 24 * 60 * 60 * 1000;
    return {
      dueSoonMs: (dueInDays - 3) * day,
      overdueMs: (dueInDays + 1) * day,
    };
  }
}
