/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DataSource, Repository } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity';
import { AuditLogService, type AuditEntry } from './audit-log.service';

function makeEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    userId: 'user-1',
    userEmail: 'a@test.dev',
    userRoles: ['author'],
    method: 'POST',
    routePattern: '/api/v1/submissions',
    path: '/api/v1/submissions',
    statusCode: 201,
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
    requestBody: null,
    params: null,
    durationMs: 50,
    error: null,
    ...overrides,
  };
}

function makeConfig(retentionDays = '90'): ConfigService {
  return {
    get: jest.fn((_key: string, fallback?: string) =>
      _key === 'AUDIT_RETENTION_DAYS' ? retentionDays : fallback,
    ),
  } as unknown as ConfigService;
}

function makeService(
  insertFn: jest.Mock,
  options: {
    retentionDays?: string;
    repo?: Partial<Repository<AuditLog>>;
  } = {},
) {
  const repo = {
    insert: insertFn,
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
    ...options.repo,
  } as unknown as Repository<AuditLog>;
  const ds = {
    getRepository: jest.fn(() => repo),
  } as unknown as DataSource;
  return {
    service: new AuditLogService(ds, makeConfig(options.retentionDays ?? '90')),
    repo,
    ds,
  };
}

describe('AuditLogService.record', () => {
  it('inserts an audit row on success', async () => {
    const insert = jest.fn().mockResolvedValue(undefined);
    const { service: svc } = makeService(insert);

    await svc.record(makeEntry());

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        method: 'POST',
        statusCode: 201,
        occurredAt: expect.any(Date),
      }),
    );
  });

  it('swallows insert errors and never re-throws', async () => {
    const insert = jest.fn().mockRejectedValue(new Error('db down'));
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const { service: svc } = makeService(insert);

    await expect(svc.record(makeEntry())).resolves.toBeUndefined();
  });

  it('logs the error message when insert fails', async () => {
    const insert = jest.fn().mockRejectedValue(new Error('connection refused'));
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const { service: svc } = makeService(insert);

    await svc.record(makeEntry());

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('connection refused'),
    );
  });
});

describe('AuditLogService.purgeOlderThanRetention', () => {
  it('returns 0 when retention is disabled', async () => {
    const insert = jest.fn();
    const { service: svc } = makeService(insert, { retentionDays: '0' });

    await expect(svc.purgeOlderThanRetention()).resolves.toBe(0);
  });

  it('deletes rows older than the retention cutoff in batches', async () => {
    const insert = jest.fn();
    const deleteFn = jest.fn().mockResolvedValue({ affected: 2 });
    const where = jest.fn().mockReturnThis();
    const qb = {
      select: jest.fn().mockReturnThis(),
      where,
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([{ id: 'al-1' }, { id: 'al-2' }]),
    };
    const createQueryBuilder = jest.fn().mockReturnValue(qb);
    const { service: svc } = makeService(insert, {
      repo: {
        delete: deleteFn,
        createQueryBuilder,
      },
    });

    await expect(svc.purgeOlderThanRetention()).resolves.toBe(2);

    expect(createQueryBuilder).toHaveBeenCalledWith('al');
    expect(deleteFn).toHaveBeenCalledWith(['al-1', 'al-2']);
    expect(where).toHaveBeenCalledWith('al.occurredAt < :cutoff', {
      cutoff: expect.any(Date),
    });
  });
});
