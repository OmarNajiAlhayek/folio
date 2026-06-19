import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { LessThan, Repository } from 'typeorm';
import { RevokedToken } from '../entities/revoked-token.entity';

@Injectable()
export class RevokedTokensService {
  constructor(
    @InjectRepository(RevokedToken)
    private readonly repo: Repository<RevokedToken>,
  ) {}

  async revoke(jti: string, userId: string, expiresAt: Date): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .insert()
      .into(RevokedToken)
      .values({ jti, userId, expiresAt })
      .orIgnore()
      .execute();
  }

  async isRevoked(jti: string): Promise<boolean> {
    return this.repo.exists({ where: { jti } });
  }

  async purgeExpired(): Promise<void> {
    await this.repo.delete({ expiresAt: LessThan(new Date()) });
  }

  /** Remove rows past JWT expiry so the denylist stays bounded. */
  @Cron('0 3 * * *')
  async purgeExpiredScheduled(): Promise<void> {
    await this.purgeExpired();
  }
}
