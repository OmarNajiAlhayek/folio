import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RefreshSession } from '../entities/refresh-session.entity';
import { RefreshSessionsService } from './refresh-sessions.service';
import { RevokedTokensService } from './revoked-tokens.service';
import { hashRefreshToken } from './refresh-token.util';

describe('RefreshSessionsService', () => {
  let service: RefreshSessionsService;
  const rows = new Map<string, RefreshSession>();
  let idCounter = 0;

  const repo = {
    create: jest.fn((partial: Partial<RefreshSession>) => ({
      id: `session-${++idCounter}`,
      revokedAt: null,
      ...partial,
    })),
    save: jest.fn((row: RefreshSession) => {
      rows.set(row.id, { ...row });
      if (row.tokenHash) {
        for (const [key, existing] of rows.entries()) {
          if (existing.tokenHash === row.tokenHash && key !== row.id) {
            rows.set(key, existing);
          }
        }
      }
      rows.set(row.id, { ...row });
      return Promise.resolve(row);
    }),
    findOne: jest.fn(
      ({
        where,
      }: {
        where: { tokenHash?: string; id?: string; userId?: string };
      }) => {
        if (where.tokenHash) {
          return Promise.resolve(
            [...rows.values()].find((r) => r.tokenHash === where.tokenHash) ??
              null,
          );
        }
        if (where.id && where.userId) {
          const row = rows.get(where.id);
          return Promise.resolve(row?.userId === where.userId ? row : null);
        }
        return Promise.resolve(null);
      },
    ),
    find: jest.fn(({ where }: { where: Record<string, unknown> }) => {
      return Promise.resolve(
        [...rows.values()].filter((row) => {
          if (where.userId && row.userId !== where.userId) return false;
          if (where.familyId && row.familyId !== where.familyId) return false;
          if (where.revokedAt === null && row.revokedAt != null) return false;
          if (where.id && typeof where.id === 'object' && '_type' in where.id) {
            const op = where.id as { _type: string; _value: string };
            if (op._type === 'not' && row.id === op._value) return false;
          }
          return true;
        }),
      );
    }),
    delete: jest.fn(),
  };

  const revokedTokens = {
    revoke: jest.fn().mockResolvedValue(undefined),
  };

  const config = {
    get: (key: string) => {
      if (key === 'REFRESH_EXPIRES_IN') return '30d';
      if (key === 'JWT_EXPIRES_IN') return '15m';
      return undefined;
    },
    getOrThrow: (key: string) => {
      if (key === 'JWT_SECRET') return 'test-secret';
      throw new Error(key);
    },
  };

  beforeEach(async () => {
    rows.clear();
    idCounter = 0;
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshSessionsService,
        { provide: getRepositoryToken(RefreshSession), useValue: repo },
        { provide: ConfigService, useValue: config },
        { provide: RevokedTokensService, useValue: revokedTokens },
      ],
    }).compile();
    service = module.get(RefreshSessionsService);
  });

  it('creates a session with hashed token', async () => {
    const created = await service.createSession('user-1', 'access-jti-1');
    expect(created.sessionId).toBeDefined();
    expect(created.refreshToken.length).toBeGreaterThan(20);
    const stored = [...rows.values()].find((r) => r.id === created.sessionId);
    expect(stored?.tokenHash).toBe(hashRefreshToken(created.refreshToken));
  });

  it('rotates a valid refresh token', async () => {
    const created = await service.createSession('user-1', 'access-jti-1');
    const rotated = await service.rotate(created.refreshToken);
    expect(rotated.userId).toBe('user-1');
    expect(rotated.refreshToken).not.toBe(created.refreshToken);
    expect(rotated.accessJti).not.toBe('access-jti-1');
  });

  it('rejects unknown refresh token', async () => {
    await expect(service.rotate('unknown-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('revokes family on reuse of revoked token', async () => {
    const created = await service.createSession('user-1', 'access-jti-1');
    const first = created.refreshToken;
    await service.rotate(first);
    await expect(service.rotate(first)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    const active = [...rows.values()].filter(
      (r) => r.familyId === created.familyId && !r.revokedAt,
    );
    expect(active).toHaveLength(0);
  });

  it('revokeById marks session revoked and denylists access jti', async () => {
    const created = await service.createSession('user-1', 'access-jti-1');
    const ok = await service.revokeById('user-1', created.sessionId);
    expect(ok).toBe(true);
    expect(revokedTokens.revoke).toHaveBeenCalledWith(
      'access-jti-1',
      'user-1',
      expect.any(Date),
    );
  });

  it('revokeAllForUser ends every active session for the user', async () => {
    const a = await service.createSession('user-1', 'access-jti-a');
    const b = await service.createSession('user-1', 'access-jti-b');
    await service.createSession('user-2', 'access-jti-other');

    const count = await service.revokeAllForUser('user-1');
    expect(count).toBe(2);
    expect(revokedTokens.revoke).toHaveBeenCalledWith(
      'access-jti-a',
      'user-1',
      expect.any(Date),
    );
    expect(revokedTokens.revoke).toHaveBeenCalledWith(
      'access-jti-b',
      'user-1',
      expect.any(Date),
    );
    const stillActive = [...rows.values()].filter(
      (r) => r.userId === 'user-1' && !r.revokedAt,
    );
    expect(stillActive).toHaveLength(0);
    expect(a.sessionId).toBeDefined();
    expect(b.sessionId).toBeDefined();
  });
});
