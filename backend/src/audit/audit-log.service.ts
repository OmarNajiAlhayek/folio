import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
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
};

export type AuditLogQuery = {
  userId?: string;
  startDate?: string;
  endDate?: string;
  method?: string;
  routePattern?: string;
  page?: number;
  limit?: number;
};

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.dataSource.getRepository(AuditLog).insert({
        ...entry,
        occurredAt: new Date(),
      });
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

    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }
}
