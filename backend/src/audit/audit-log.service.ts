import { generateEntityId } from '@folio/shared';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type QueryDeepPartialEntity } from 'typeorm';
import type { AuditActionType, AuditResourceType } from './audit-action';
import { AuditLog } from '../entities/audit-log.entity';

export type AuditEntry = {
  userId: string | null;
  userEmail: string | null;
  userRoles: string[] | null;
  method: string;
  routePattern: string | null;
  path: string;
  statusCode: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestBody: Record<string, unknown> | null;
  params: Record<string, unknown> | null;
  durationMs: number | null;
  error: string | null;
  actionType: AuditActionType | null;
  resourceType: AuditResourceType | null;
  resourceId: string | null;
};

export type AuditLogQuery = {
  userId?: string;
  startDate?: string;
  endDate?: string;
  method?: string;
  routePattern?: string;
  actionType?: string;
  resourceType?: string;
  resourceId?: string;
  page?: number;
  limit?: number;
};

const DEFAULT_AUDIT_RETENTION_DAYS = 90;
const AUDIT_PURGE_BATCH_SIZE = 1000;

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);
  private readonly retentionDays: number;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    const raw = config.get<string>(
      'AUDIT_RETENTION_DAYS',
      String(DEFAULT_AUDIT_RETENTION_DAYS),
    );
    const parsed = parseInt(raw, 10);
    this.retentionDays = Number.isFinite(parsed)
      ? parsed
      : DEFAULT_AUDIT_RETENTION_DAYS;
  }

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.dataSource.getRepository(AuditLog).insert({
        id: generateEntityId(),
        ...entry,
        occurredAt: new Date(),
      } as QueryDeepPartialEntity<AuditLog>);
    } catch (err) {
      this.logger.error(
        `audit.record failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async findAll(query: AuditLogQuery): Promise<{
    items: AuditLog[];
    total: number;
    page: number;
    limit: number;
  }> {
    const limit = Math.min(query.limit ?? 20, 100);
    const page = Math.max(query.page ?? 1, 1);

    const qb = this.dataSource
      .getRepository(AuditLog)
      .createQueryBuilder('al')
      .orderBy('al.occurredAt', 'DESC');

    if (query.userId) {
      qb.andWhere('al.userId = :userId', { userId: query.userId });
    }
    if (query.startDate) {
      qb.andWhere('al.occurredAt >= :startDate', {
        startDate: new Date(query.startDate),
      });
    }
    if (query.endDate) {
      qb.andWhere('al.occurredAt <= :endDate', {
        endDate: new Date(query.endDate),
      });
    }
    if (query.method) {
      qb.andWhere('al.method = :method', {
        method: query.method.toUpperCase(),
      });
    }
    if (query.routePattern) {
      qb.andWhere('al.routePattern = :routePattern', {
        routePattern: query.routePattern,
      });
    }
    if (query.actionType) {
      qb.andWhere('al.actionType = :actionType', {
        actionType: query.actionType,
      });
    }
    if (query.resourceType) {
      qb.andWhere('al.resourceType = :resourceType', {
        resourceType: query.resourceType,
      });
    }
    if (query.resourceId) {
      qb.andWhere('al.resourceId = :resourceId', {
        resourceId: query.resourceId,
      });
    }

    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  /** Delete rows older than AUDIT_RETENTION_DAYS. Set retention to 0 to disable. */
  async purgeOlderThanRetention(): Promise<number> {
    if (this.retentionDays <= 0) {
      return 0;
    }

    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - this.retentionDays);

    const repo = this.dataSource.getRepository(AuditLog);
    let totalDeleted = 0;

    while (true) {
      const stale = await repo
        .createQueryBuilder('al')
        .select('al.id')
        .where('al.occurredAt < :cutoff', { cutoff })
        .orderBy('al.occurredAt', 'ASC')
        .limit(AUDIT_PURGE_BATCH_SIZE)
        .getMany();

      if (stale.length === 0) {
        break;
      }

      const result = await repo.delete(stale.map((row) => row.id));
      totalDeleted += result.affected ?? stale.length;

      if (stale.length < AUDIT_PURGE_BATCH_SIZE) {
        break;
      }
    }

    if (totalDeleted > 0) {
      this.logger.log(
        `Purged ${totalDeleted} audit log row(s) older than ${this.retentionDays} day(s)`,
      );
    }

    return totalDeleted;
  }

  @Cron('0 3 * * *')
  async purgeOlderThanRetentionScheduled(): Promise<void> {
    await this.purgeOlderThanRetention();
  }
}
