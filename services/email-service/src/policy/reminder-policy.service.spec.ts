import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { EmailReminderPolicyEntity } from '../entities/email-reminder-policy.entity';
import { ReminderPolicyService } from './reminder-policy.service';

describe('ReminderPolicyService', () => {
  const day = 24 * 60 * 60 * 1000;

  const makeService = (
    reviewDueInDays: number | null,
    envReviewDueInDays?: string,
  ) => {
    const policyRepo = {
      findOne: jest.fn().mockResolvedValue(
        reviewDueInDays === null
          ? null
          : ({
              id: 1,
              reviewDueInDays,
              updatedAt: new Date(),
            } as EmailReminderPolicyEntity),
      ),
    } as unknown as Repository<EmailReminderPolicyEntity>;
    const config = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'REVIEW_DUE_IN_DAYS') {
          return envReviewDueInDays ?? fallback;
        }
        return fallback;
      }),
    } as unknown as ConfigService;
    return new ReminderPolicyService(policyRepo, config);
  };

  it('computes offsets from policy row when present', async () => {
    const svc = makeService(21);
    await expect(svc.getDueOffsetsMs()).resolves.toEqual({
      dueSoonMs: 18 * day,
      overdueMs: 22 * day,
    });
  });

  it('clamps values below 4 to minimum with warning', async () => {
    const svc = makeService(2);
    await expect(svc.getDueOffsetsMs()).resolves.toEqual({
      dueSoonMs: 1 * day,
      overdueMs: 5 * day,
    });
  });

  it('falls back to env when policy row is missing', async () => {
    const svc = makeService(null, '14');
    await expect(svc.getDueOffsetsMs()).resolves.toEqual({
      dueSoonMs: 11 * day,
      overdueMs: 15 * day,
    });
  });
});
