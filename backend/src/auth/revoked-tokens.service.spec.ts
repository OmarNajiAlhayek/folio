import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LessThan } from 'typeorm';
import { RevokedToken } from '../entities/revoked-token.entity';
import { RevokedTokensService } from './revoked-tokens.service';

describe('RevokedTokensService', () => {
  let service: RevokedTokensService;
  const qb = {
    insert: jest.fn().mockReturnThis(),
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orIgnore: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(undefined),
  };
  const repo = {
    createQueryBuilder: jest.fn(() => qb),
    count: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RevokedTokensService,
        { provide: getRepositoryToken(RevokedToken), useValue: repo },
      ],
    }).compile();
    service = module.get(RevokedTokensService);
  });

  it('revoke inserts with orIgnore', async () => {
    const exp = new Date('2030-01-01T00:00:00.000Z');
    await service.revoke('jti-1', 'user-1', exp);
    expect(qb.values).toHaveBeenCalledWith({
      jti: 'jti-1',
      userId: 'user-1',
      expiresAt: exp,
    });
    expect(qb.orIgnore).toHaveBeenCalled();
  });

  it('isRevoked returns true when row exists', async () => {
    repo.count.mockResolvedValue(1);
    await expect(service.isRevoked('jti-1')).resolves.toBe(true);
  });

  it('isRevoked returns false when row missing', async () => {
    repo.count.mockResolvedValue(0);
    await expect(service.isRevoked('jti-1')).resolves.toBe(false);
  });

  it('purgeExpired deletes rows past expires_at', async () => {
    repo.delete.mockResolvedValue({ affected: 2 });
    await service.purgeExpired();
    expect(repo.delete).toHaveBeenCalledWith({
      expiresAt: LessThan(expect.any(Date)),
    });
  });
});
