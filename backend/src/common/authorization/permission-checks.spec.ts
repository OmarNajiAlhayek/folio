import { ForbiddenException } from '@nestjs/common';
import {
  assertCallerHasAnyPermission,
  assertCallerHasEveryPermission,
  assertCallerPermission,
  hasAnyPermission,
  hasEveryPermission,
  hasPermission,
} from './permission-checks';
import type { RequestUser } from '../types/request-user';

function user(slugs: string[]): RequestUser {
  return {
    sub: 'u1',
    email: 'e@test.dev',
    roleSlugs: [],
    permissionSlugs: slugs,
  };
}

describe('permission-checks', () => {
  it('hasPermission matches slug membership', () => {
    expect(hasPermission(user(['a', 'b']), 'a')).toBe(true);
    expect(hasPermission(user(['a']), 'b')).toBe(false);
  });

  it('hasAnyPermission is OR', () => {
    expect(hasAnyPermission(user(['a']), ['a', 'b'])).toBe(true);
    expect(hasAnyPermission(user(['c']), ['a', 'b'])).toBe(false);
  });

  it('hasEveryPermission is AND', () => {
    expect(hasEveryPermission(user(['a', 'b']), ['a', 'b'])).toBe(true);
    expect(hasEveryPermission(user(['a']), ['a', 'b'])).toBe(false);
  });

  it('assertCallerPermission throws when slug missing', () => {
    expect(() => assertCallerPermission(user([]), 'a')).toThrow(
      ForbiddenException,
    );
  });

  it('assertCallerHasAnyPermission throws when no slug matches', () => {
    expect(() => assertCallerHasAnyPermission(user(['c']), ['a', 'b'])).toThrow(
      ForbiddenException,
    );
  });

  it('assertCallerHasEveryPermission throws when any slug missing', () => {
    expect(() =>
      assertCallerHasEveryPermission(user(['a']), ['a', 'b']),
    ).toThrow(ForbiddenException);
  });
});
