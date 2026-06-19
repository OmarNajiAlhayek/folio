import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailReminderPolicyEntity } from '../entities/email-reminder-policy.entity';

const MIN_REVIEW_DUE_DAYS = 4;
const DEFAULT_REVIEW_DUE_DAYS = 21;

/**
 * Global reminder cadence from `email.email_reminder_policy` (singleton row id=1).
 * Env `REVIEW_DUE_IN_DAYS` is fallback when the row is missing.
 */
@Injectable()
export class ReminderPolicyService {
  private readonly logger = new Logger(ReminderPolicyService.name);

  constructor(
    @InjectRepository(EmailReminderPolicyEntity)
    private readonly policyRepo: Repository<EmailReminderPolicyEntity>,
    private readonly config: ConfigService,
  ) {}

  async getDueOffsetsMs(): Promise<{ dueSoonMs: number; overdueMs: number }> {
    const row = await this.policyRepo.findOne({ where: { id: 1 } });
    let dueInDays =
      row?.reviewDueInDays ??
      parseInt(
        this.config.get<string>(
          'REVIEW_DUE_IN_DAYS',
          String(DEFAULT_REVIEW_DUE_DAYS),
        ) ?? String(DEFAULT_REVIEW_DUE_DAYS),
        10,
      );
    if (!Number.isFinite(dueInDays)) {
      this.logger.warn(
        `Invalid reviewDueInDays=${String(dueInDays)}; using default ${DEFAULT_REVIEW_DUE_DAYS}`,
      );
      dueInDays = DEFAULT_REVIEW_DUE_DAYS;
    } else if (dueInDays < MIN_REVIEW_DUE_DAYS) {
      this.logger.warn(
        `reviewDueInDays=${dueInDays} below minimum ${MIN_REVIEW_DUE_DAYS}; clamping`,
      );
      dueInDays = MIN_REVIEW_DUE_DAYS;
    }
    const day = 24 * 60 * 60 * 1000;
    return {
      dueSoonMs: (dueInDays - 3) * day,
      overdueMs: (dueInDays + 1) * day,
    };
  }
}
