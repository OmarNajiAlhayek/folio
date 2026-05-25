import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';
import type { RequestUser } from '../common/types/request-user';
import { SubmissionsController } from './submissions.controller';

function mockContext(
  user: RequestUser,
  handler: (...args: unknown[]) => unknown,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => SubmissionsController,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as ExecutionContext;
}

describe('SubmissionsController permissions guard', () => {
  const guard = new PermissionsGuard(new Reflector());

  const stranger: RequestUser = {
    sub: 'stranger-1',
    email: 'stranger@test.dev',
    roleSlugs: [],
    permissionSlugs: [],
  };

  it('findOne denies before service when user has no read slugs', () => {
    expect(() =>
      guard.canActivate(
        mockContext(stranger, SubmissionsController.prototype.findOne),
      ),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'FORBIDDEN',
        }),
      }),
    );
  });

  it('findOne allows when user has a submission read slug', () => {
    const author: RequestUser = {
      sub: 'author-1',
      email: 'author@test.dev',
      roleSlugs: ['author'],
      permissionSlugs: [PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN],
    };
    expect(
      guard.canActivate(
        mockContext(author, SubmissionsController.prototype.findOne),
      ),
    ).toBe(true);
  });

  it('findAll denies stranger without list slugs', () => {
    expect(() =>
      guard.canActivate(
        mockContext(stranger, SubmissionsController.prototype.findAll),
      ),
    ).toThrow(ForbiddenException);
  });
});
