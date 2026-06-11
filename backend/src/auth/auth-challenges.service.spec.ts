import { HttpException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthChallenge } from '../entities/auth-challenge.entity';
import { AuthChallengesService } from './auth-challenges.service';
import { hashAuthSecret } from './auth-challenge-secret.util';

describe('AuthChallengesService', () => {
  let service: AuthChallengesService;
  const rows: AuthChallenge[] = [];
  let idCounter = 0;

  const repo = {
    create: jest.fn((partial: Partial<AuthChallenge>) => ({
      id: `challenge-${++idCounter}`,
      attemptCount: 0,
      consumedAt: null,
      createdAt: new Date(),
      ...partial,
    })),
    save: jest.fn((row: AuthChallenge) => {
      const idx = rows.findIndex((r) => r.id === row.id);
      if (idx >= 0) rows[idx] = { ...row };
      else rows.push({ ...row });
      return Promise.resolve(row);
    }),
    findOne: jest.fn(
      (opts: {
        where: Record<string, unknown>;
        order?: Record<string, string>;
      }) => {
        const matches = rows.filter((row) => {
          for (const [key, value] of Object.entries(opts.where)) {
            const cell = (row as Record<string, unknown>)[key];
            if (
              value &&
              typeof value === 'object' &&
              '_type' in value &&
              (value as { _type: string })._type === 'isNull'
            ) {
              if (cell != null) return false;
              continue;
            }
            if (value === null && cell != null) {
              return false;
            }
            if (value !== null && cell !== value) {
              return false;
            }
          }
          return true;
        });
        if (opts.order?.createdAt === 'DESC') {
          matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        return Promise.resolve(matches[0] ?? null);
      },
    ),
    update: jest.fn(
      (where: Record<string, unknown>, patch: Partial<AuthChallenge>) => {
        for (const row of rows) {
          let ok = true;
          for (const [key, value] of Object.entries(where)) {
            if ((row as Record<string, unknown>)[key] !== value) ok = false;
          }
          if (ok) Object.assign(row, patch);
        }
        return Promise.resolve();
      },
    ),
    count: jest.fn(() => Promise.resolve(0)),
  };

  const config = {
    get: (key: string, fallback?: string) => {
      const map: Record<string, string> = {
        AUTH_OTP_TTL_MS: '900000',
        AUTH_OTP_MAX_ATTEMPTS: '5',
        AUTH_OTP_RESEND_COOLDOWN_MS: '0',
        AUTH_OTP_MAX_SENDS_PER_HOUR: '5',
        AUTH_RESET_TTL_MS: '3600000',
      };
      return map[key] ?? fallback;
    },
  };

  beforeEach(async () => {
    rows.length = 0;
    idCounter = 0;
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthChallengesService,
        { provide: getRepositoryToken(AuthChallenge), useValue: repo },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = module.get(AuthChallengesService);
  });

  it('creates email verification OTP with hashed secret', async () => {
    const created = await service.createEmailVerificationOtp('user-1');
    expect(created.otpCode).toMatch(/^\d{6}$/);
    const stored = rows.find((r) => r.id === created.challengeId);
    expect(stored?.secretHash).toBe(hashAuthSecret(created.otpCode));
    expect(stored?.purpose).toBe('email_verification');
  });

  it('verifies correct OTP and marks challenge consumed', async () => {
    const created = await service.createEmailVerificationOtp('user-1');
    await service.verifyOtp('user-1', created.otpCode);
    const stored = rows.find((r) => r.id === created.challengeId);
    expect(stored?.consumedAt).not.toBeNull();
  });

  it('rejects wrong OTP and increments attempts', async () => {
    const created = await service.createEmailVerificationOtp('user-1');
    await expect(service.verifyOtp('user-1', '000000')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    const stored = rows.find((r) => r.id === created.challengeId);
    expect(stored?.attemptCount).toBe(1);
  });

  it('consumes password reset token once', async () => {
    const created = await service.createPasswordResetToken('user-1');
    const userId = await service.consumeResetToken(created.resetToken);
    expect(userId).toBe('user-1');
    await expect(
      service.consumeResetToken(created.resetToken),
    ).rejects.toBeInstanceOf(HttpException);
  });
});
