/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Logger } from '@nestjs/common';
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

function makeService(insertFn: jest.Mock) {
  const repo = { insert: insertFn } as unknown as Repository<AuditLog>;
  const ds = {
    getRepository: jest.fn(() => repo),
  } as unknown as DataSource;
  return new AuditLogService(ds);
}

describe('AuditLogService.record', () => {
  it('inserts an audit row on success', async () => {
    const insert = jest.fn().mockResolvedValue(undefined);
    const svc = makeService(insert);

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
    const svc = makeService(insert);

    await expect(svc.record(makeEntry())).resolves.toBeUndefined();
  });

  it('logs the error message when insert fails', async () => {
    const insert = jest.fn().mockRejectedValue(new Error('connection refused'));
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const svc = makeService(insert);

    await svc.record(makeEntry());

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('connection refused'),
    );
  });
});
