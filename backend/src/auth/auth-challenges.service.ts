import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import {
  AuthChallenge,
  type AuthChallengePurpose,
} from '../entities/auth-challenge.entity';
import {
  generateOtpCode,
  generateResetToken,
  hashAuthSecret,
  timingSafeEqualHex,
} from './auth-challenge-secret.util';

export type CreatedEmailVerification = {
  challengeId: string;
  otpCode: string;
  expiresAt: Date;
};

export type CreatedPasswordReset = {
  challengeId: string;
  resetToken: string;
  expiresAt: Date;
};

@Injectable()
export class AuthChallengesService {
  constructor(
    @InjectRepository(AuthChallenge)
    private readonly repo: Repository<AuthChallenge>,
    private readonly config: ConfigService,
  ) {}

  private otpTtlMs(): number {
    return parseInt(this.config.get<string>('AUTH_OTP_TTL_MS', '900000'), 10);
  }

  private resetTtlMs(): number {
    return parseInt(
      this.config.get<string>('AUTH_RESET_TTL_MS', '3600000'),
      10,
    );
  }

  private maxAttempts(): number {
    return parseInt(this.config.get<string>('AUTH_OTP_MAX_ATTEMPTS', '5'), 10);
  }

  private resendCooldownMs(): number {
    return parseInt(
      this.config.get<string>('AUTH_OTP_RESEND_COOLDOWN_MS', '60000'),
      10,
    );
  }

  private maxSendsPerHour(): number {
    return parseInt(
      this.config.get<string>('AUTH_OTP_MAX_SENDS_PER_HOUR', '5'),
      10,
    );
  }

  async createEmailVerificationOtp(
    userId: string,
  ): Promise<CreatedEmailVerification> {
    await this.assertCanSend(userId, 'email_verification');
    await this.invalidateActive(userId, 'email_verification');

    const otpCode = generateOtpCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.otpTtlMs());
    const row = this.repo.create({
      userId,
      purpose: 'email_verification',
      secretHash: hashAuthSecret(otpCode),
      expiresAt,
      consumedAt: null,
      attemptCount: 0,
    });
    const saved = await this.repo.save(row);
    return { challengeId: saved.id, otpCode, expiresAt };
  }

  async createPasswordResetToken(
    userId: string,
  ): Promise<CreatedPasswordReset> {
    await this.assertCanSend(userId, 'password_reset');
    await this.invalidateActive(userId, 'password_reset');

    const resetToken = generateResetToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.resetTtlMs());
    const row = this.repo.create({
      userId,
      purpose: 'password_reset',
      secretHash: hashAuthSecret(resetToken),
      expiresAt,
      consumedAt: null,
      attemptCount: 0,
    });
    const saved = await this.repo.save(row);
    return { challengeId: saved.id, resetToken, expiresAt };
  }

  async verifyOtp(userId: string, code: string): Promise<void> {
    const normalized = code.trim();
    if (!/^\d{6}$/.test(normalized)) {
      throw new BadRequestException({
        message: 'Verification code must be 6 digits',
        code: 'INVALID_OTP',
      });
    }

    const challenge = await this.findActiveChallenge(
      userId,
      'email_verification',
    );
    if (!challenge) {
      throw new UnauthorizedException({
        message: 'Verification code expired or not found',
        code: 'OTP_EXPIRED',
      });
    }

    if (challenge.expiresAt < new Date()) {
      throw new UnauthorizedException({
        message: 'Verification code expired',
        code: 'OTP_EXPIRED',
      });
    }

    if (challenge.attemptCount >= this.maxAttempts()) {
      throw new HttpException(
        { message: 'Too many failed attempts', code: 'OTP_MAX_ATTEMPTS' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const hash = hashAuthSecret(normalized);
    if (!timingSafeEqualHex(hash, challenge.secretHash)) {
      challenge.attemptCount += 1;
      await this.repo.save(challenge);
      if (challenge.attemptCount >= this.maxAttempts()) {
        throw new HttpException(
          { message: 'Too many failed attempts', code: 'OTP_MAX_ATTEMPTS' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new UnauthorizedException({
        message: 'Invalid verification code',
        code: 'INVALID_OTP',
      });
    }

    challenge.consumedAt = new Date();
    await this.repo.save(challenge);
  }

  async validateResetToken(token: string): Promise<string> {
    const userId = await this.lookupResetUserId(token);
    if (!userId) {
      throw new BadRequestException({
        message: 'Invalid or expired reset link',
        code: 'INVALID_RESET_TOKEN',
      });
    }
    return userId;
  }

  async consumeResetToken(token: string): Promise<string> {
    const hash = hashAuthSecret(token.trim());
    const challenge = await this.repo.findOne({
      where: {
        purpose: 'password_reset',
        secretHash: hash,
        consumedAt: IsNull(),
      },
    });
    if (!challenge || challenge.expiresAt < new Date()) {
      throw new BadRequestException({
        message: 'Invalid or expired reset link',
        code: 'INVALID_RESET_TOKEN',
      });
    }
    challenge.consumedAt = new Date();
    await this.repo.save(challenge);
    return challenge.userId;
  }

  private async lookupResetUserId(token: string): Promise<string | null> {
    const hash = hashAuthSecret(token.trim());
    const challenge = await this.repo.findOne({
      where: {
        purpose: 'password_reset',
        secretHash: hash,
        consumedAt: IsNull(),
      },
    });
    if (!challenge || challenge.expiresAt < new Date()) {
      return null;
    }
    return challenge.userId;
  }

  private async findActiveChallenge(
    userId: string,
    purpose: AuthChallengePurpose,
  ): Promise<AuthChallenge | null> {
    return this.repo.findOne({
      where: { userId, purpose, consumedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  private async invalidateActive(
    userId: string,
    purpose: AuthChallengePurpose,
  ): Promise<void> {
    const now = new Date();
    await this.repo.update(
      { userId, purpose, consumedAt: IsNull() },
      { consumedAt: now },
    );
  }

  private async assertCanSend(
    userId: string,
    purpose: AuthChallengePurpose,
  ): Promise<void> {
    const latest = await this.repo.findOne({
      where: { userId, purpose },
      order: { createdAt: 'DESC' },
    });
    if (latest) {
      const elapsed = Date.now() - latest.createdAt.getTime();
      if (elapsed < this.resendCooldownMs()) {
        throw new HttpException(
          {
            message: 'Please wait before requesting another code',
            code: 'OTP_RESEND_COOLDOWN',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentCount = await this.repo.count({
      where: {
        userId,
        purpose,
        createdAt: MoreThan(hourAgo),
      },
    });
    if (recentCount >= this.maxSendsPerHour()) {
      throw new HttpException(
        {
          message: 'Too many requests. Try again later.',
          code: 'OTP_RESEND_COOLDOWN',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
