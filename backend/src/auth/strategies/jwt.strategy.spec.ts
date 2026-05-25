import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from '../../users/users.service';
import { RbacService } from '../../rbac/rbac.service';
import { RevokedTokensService } from '../revoked-tokens.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  const usersService = { findById: jest.fn() };
  const rbacService = { getEffectiveForUser: jest.fn() };
  const revokedTokens = { isRevoked: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => 'test-secret' },
        },
        { provide: UsersService, useValue: usersService },
        { provide: RbacService, useValue: rbacService },
        { provide: RevokedTokensService, useValue: revokedTokens },
      ],
    }).compile();
    strategy = module.get(JwtStrategy);
  });

  it('rejects payload without jti', async () => {
    await expect(
      strategy.validate({ sub: 'u1', email: 'a@b.c' } as never),
    ).rejects.toThrow(UnauthorizedException);
    expect(usersService.findById).not.toHaveBeenCalled();
  });

  it('rejects revoked jti', async () => {
    revokedTokens.isRevoked.mockResolvedValue(true);
    await expect(
      strategy.validate({ sub: 'u1', email: 'a@b.c', jti: 'revoked-jti' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(usersService.findById).not.toHaveBeenCalled();
  });

  it('returns RequestUser when jti is valid', async () => {
    revokedTokens.isRevoked.mockResolvedValue(false);
    usersService.findById.mockResolvedValue({
      id: 'u1',
      email: 'a@b.c',
    });
    rbacService.getEffectiveForUser.mockResolvedValue({
      roleSlugs: ['author'],
      permissionSlugs: ['submission.manage_own'],
    });
    await expect(
      strategy.validate({ sub: 'u1', email: 'a@b.c', jti: 'ok-jti' }),
    ).resolves.toEqual({
      sub: 'u1',
      email: 'a@b.c',
      roleSlugs: ['author'],
      permissionSlugs: ['submission.manage_own'],
    });
  });
});
