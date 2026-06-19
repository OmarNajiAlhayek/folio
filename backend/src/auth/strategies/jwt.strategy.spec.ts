import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { RevokedTokensService } from '../revoked-tokens.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
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
        { provide: RevokedTokensService, useValue: revokedTokens },
      ],
    }).compile();
    strategy = module.get(JwtStrategy);
  });

  const validPayload = {
    sub: 'u1',
    email: 'a@b.c',
    jti: 'ok-jti',
    roleSlugs: ['author'],
    permissionSlugs: ['submission.manage_own'],
  };

  it('rejects payload without jti', async () => {
    await expect(
      strategy.validate({ ...validPayload, jti: '' } as never),
    ).rejects.toThrow(UnauthorizedException);
    expect(revokedTokens.isRevoked).not.toHaveBeenCalled();
  });

  it('rejects payload without roleSlugs', async () => {
    await expect(
      strategy.validate({ ...validPayload, roleSlugs: undefined } as never),
    ).rejects.toThrow(UnauthorizedException);
    expect(revokedTokens.isRevoked).not.toHaveBeenCalled();
  });

  it('rejects revoked jti', async () => {
    revokedTokens.isRevoked.mockResolvedValue(true);
    await expect(strategy.validate(validPayload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('returns RequestUser from payload claims when jti is valid', async () => {
    revokedTokens.isRevoked.mockResolvedValue(false);
    await expect(strategy.validate(validPayload)).resolves.toEqual({
      sub: 'u1',
      email: 'a@b.c',
      roleSlugs: ['author'],
      permissionSlugs: ['submission.manage_own'],
    });
  });
});
