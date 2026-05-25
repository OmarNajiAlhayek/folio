import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_AUTHENTICATED_KEY } from '../decorators/allow-authenticated.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { PermissionsGuard } from './permissions.guard';
import type { RequestUser } from '../types/request-user';

function mockContext(
  user: RequestUser | undefined,
  handler: object = {},
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as ExecutionContext;
}

describe('PermissionsGuard', () => {
  let reflector: Reflector;
  let guard: PermissionsGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionsGuard(reflector);
  });

  it('denies when handler has no @Permissions() or @AllowAuthenticated()', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === PERMISSIONS_KEY) return undefined;
      if (key === ALLOW_AUTHENTICATED_KEY) return undefined;
      return undefined;
    });
    expect(() =>
      guard.canActivate(
        mockContext({
          sub: 'u1',
          email: 'a@test.dev',
          roleSlugs: [],
          permissionSlugs: [],
        }),
      ),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          message: 'Route requires explicit permissions',
          code: 'FORBIDDEN',
        }),
      }),
    );
  });

  it('allows @AllowAuthenticated() without permission slugs', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === PERMISSIONS_KEY) return undefined;
      if (key === ALLOW_AUTHENTICATED_KEY) return true;
      return undefined;
    });
    expect(
      guard.canActivate(
        mockContext({
          sub: 'u1',
          email: 'a@test.dev',
          roleSlugs: [],
          permissionSlugs: [],
        }),
      ),
    ).toBe(true);
  });

  it('denies @Permissions() when user lacks all required slugs (OR)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === PERMISSIONS_KEY) return ['perm.a', 'perm.b'];
      return undefined;
    });
    expect(() =>
      guard.canActivate(
        mockContext({
          sub: 'u1',
          email: 'a@test.dev',
          roleSlugs: [],
          permissionSlugs: ['perm.c'],
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows @Permissions() when user has any required slug (OR)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === PERMISSIONS_KEY) return ['perm.a', 'perm.b'];
      return undefined;
    });
    expect(
      guard.canActivate(
        mockContext({
          sub: 'u1',
          email: 'a@test.dev',
          roleSlugs: [],
          permissionSlugs: ['perm.b'],
        }),
      ),
    ).toBe(true);
  });

  it('denies @Permissions() when user is missing on request', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === PERMISSIONS_KEY) return ['perm.a'];
      return undefined;
    });
    expect(() => guard.canActivate(mockContext(undefined))).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          message: 'Forbidden',
          code: 'FORBIDDEN',
        }),
      }),
    );
  });
});
