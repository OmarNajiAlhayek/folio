import { randomUUID } from 'crypto';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { IsNull, LessThan, Not, Repository } from 'typeorm';
import { RefreshSession } from '../entities/refresh-session.entity';
import { RevokedTokensService } from './revoked-tokens.service';
import { parseDurationMs } from './parse-duration.util';
import {
  generateRefreshToken,
  hashIp,
  hashRefreshToken,
} from './refresh-token.util';

export type SessionMeta = {
  userAgent?: string;
  ip?: string;
};

export type CreatedSession = {
  refreshToken: string;
  sessionId: string;
  familyId: string;
  accessJti: string;
};

export type RotatedSession = CreatedSession & {
  userId: string;
};

export type SessionListItem = {
  id: string;
  userAgent: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  isCurrent: boolean;
};

@Injectable()
export class RefreshSessionsService {
  private readonly logger = new Logger(RefreshSessionsService.name);

  constructor(
    @InjectRepository(RefreshSession)
    private readonly repo: Repository<RefreshSession>,
    private readonly config: ConfigService,
    private readonly revokedTokens: RevokedTokensService,
  ) {}

  private refreshTtlMs(): number {
    const raw = this.config.get<string>('REFRESH_EXPIRES_IN') ?? '30d';
    return parseDurationMs(raw);
  }

  private accessTtlMs(): number {
    const raw = this.config.get<string>('JWT_EXPIRES_IN') ?? '15m';
    return parseDurationMs(raw);
  }

  private ipHash(ip?: string): string | null {
    const secret = this.config.getOrThrow<string>('JWT_SECRET');
    return hashIp(ip, secret);
  }

  async createSession(
    userId: string,
    accessJti: string,
    meta: SessionMeta = {},
  ): Promise<CreatedSession> {
    const refreshToken = generateRefreshToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.refreshTtlMs());
    const familyId = randomUUID();
    const row = this.repo.create({
      userId,
      tokenHash: hashRefreshToken(refreshToken),
      familyId,
      accessJti,
      userAgent: meta.userAgent?.slice(0, 512) ?? null,
      ipHash: this.ipHash(meta.ip),
      lastUsedAt: now,
      expiresAt,
      revokedAt: null,
    });
    const saved = await this.repo.save(row);
    return {
      refreshToken,
      sessionId: saved.id,
      familyId,
      accessJti,
    };
  }

  async resolveSessionId(refreshToken: string): Promise<string | null> {
    const hash = hashRefreshToken(refreshToken);
    const session = await this.repo.findOne({ where: { tokenHash: hash } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return null;
    }
    return session.id;
  }

  async rotate(
    refreshToken: string,
    meta: SessionMeta = {},
  ): Promise<RotatedSession> {
    const hash = hashRefreshToken(refreshToken);
    const session = await this.repo.findOne({ where: { tokenHash: hash } });
    if (!session) {
      throw new UnauthorizedException({
        message: 'Invalid refresh token',
        code: 'UNAUTHORIZED',
      });
    }

    if (session.revokedAt) {
      await this.revokeFamily(session.familyId);
      this.logger.warn(
        `Refresh token reuse detected for family ${session.familyId}`,
      );
      throw new UnauthorizedException({
        message: 'Session ended',
        code: 'UNAUTHORIZED',
      });
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException({
        message: 'Refresh token expired',
        code: 'UNAUTHORIZED',
      });
    }

    const now = new Date();
    session.revokedAt = now;
    await this.repo.save(session);

    const newRefreshToken = generateRefreshToken();
    const accessJti = randomUUID();
    const expiresAt = new Date(now.getTime() + this.refreshTtlMs());
    const next = this.repo.create({
      userId: session.userId,
      tokenHash: hashRefreshToken(newRefreshToken),
      familyId: session.familyId,
      accessJti,
      userAgent: meta.userAgent?.slice(0, 512) ?? session.userAgent,
      ipHash: this.ipHash(meta.ip) ?? session.ipHash,
      lastUsedAt: now,
      expiresAt,
      revokedAt: null,
    });
    const saved = await this.repo.save(next);

    return {
      refreshToken: newRefreshToken,
      sessionId: saved.id,
      familyId: session.familyId,
      accessJti,
      userId: session.userId,
    };
  }

  async revokeByRefreshToken(refreshToken: string): Promise<void> {
    const hash = hashRefreshToken(refreshToken);
    const session = await this.repo.findOne({ where: { tokenHash: hash } });
    if (!session || session.revokedAt) {
      return;
    }
    await this.revokeSessionRow(session);
  }

  async revokeById(userId: string, sessionId: string): Promise<boolean> {
    const session = await this.repo.findOne({
      where: { id: sessionId, userId },
    });
    if (!session || session.revokedAt) {
      return false;
    }
    await this.revokeSessionRow(session);
    return true;
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const sessions = await this.repo.find({
      where: { userId, revokedAt: IsNull() },
    });
    const now = new Date();
    let count = 0;
    for (const session of sessions) {
      if (session.expiresAt < now) continue;
      await this.revokeSessionRow(session);
      count += 1;
    }
    return count;
  }

  async revokeAllExcept(
    userId: string,
    currentSessionId: string,
  ): Promise<number> {
    const sessions = await this.repo.find({
      where: {
        userId,
        revokedAt: IsNull(),
        id: Not(currentSessionId),
      },
    });
    let count = 0;
    for (const session of sessions) {
      if (session.expiresAt < new Date()) continue;
      await this.revokeSessionRow(session);
      count += 1;
    }
    return count;
  }

  async listForUser(
    userId: string,
    currentSessionId?: string,
  ): Promise<SessionListItem[]> {
    const now = new Date();
    const rows = await this.repo.find({
      where: { userId, revokedAt: IsNull() },
      order: { lastUsedAt: 'DESC' },
    });
    return rows
      .filter((row) => row.expiresAt >= now)
      .map((row) => ({
        id: row.id,
        userAgent: row.userAgent,
        createdAt: row.createdAt,
        lastUsedAt: row.lastUsedAt,
        expiresAt: row.expiresAt,
        isCurrent: currentSessionId != null && row.id === currentSessionId,
      }));
  }

  async purgeExpired(): Promise<void> {
    await this.repo.delete({ expiresAt: LessThan(new Date()) });
  }

  @Cron('0 3 * * *')
  async purgeExpiredScheduled(): Promise<void> {
    await this.purgeExpired();
  }

  private async revokeFamily(familyId: string): Promise<void> {
    const sessions = await this.repo.find({
      where: { familyId, revokedAt: IsNull() },
    });
    for (const session of sessions) {
      await this.revokeSessionRow(session);
    }
  }

  private async revokeSessionRow(session: RefreshSession): Promise<void> {
    if (!session.revokedAt) {
      session.revokedAt = new Date();
      await this.repo.save(session);
    }
    const accessExpiresAt = new Date(Date.now() + this.accessTtlMs());
    await this.revokedTokens.revoke(
      session.accessJti,
      session.userId,
      accessExpiresAt,
    );
  }
}
