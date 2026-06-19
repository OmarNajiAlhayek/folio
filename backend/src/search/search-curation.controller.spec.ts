/* eslint-disable @typescript-eslint/unbound-method */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import { SearchCurationController } from './search-curation.controller';
import { SearchService } from './search.service';
import { SearchSyncService } from './search-sync.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';
import type { RequestUser } from '../common/types/request-user';

// Injects a configurable user into the request so we can test permission boundaries.
let activeUser: RequestUser | null = null;

class FakeJwtGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ user?: RequestUser }>();
    if (activeUser) req.user = activeUser;
    return true;
  }
}

function makeUser(permissionSlugs: string[]): RequestUser {
  return { sub: 'u1', email: 'u@test.com', roleSlugs: [], permissionSlugs };
}

describe('SearchCurationController — reindex permission', () => {
  let module: TestingModule;
  let searchService: jest.Mocked<Pick<SearchService, 'isEnabled'>>;
  let syncService: jest.Mocked<
    Pick<SearchSyncService, 'isReindexInProgress' | 'reindex'>
  >;

  beforeEach(async () => {
    searchService = { isEnabled: jest.fn().mockReturnValue(true) };
    syncService = {
      isReindexInProgress: jest.fn().mockReturnValue(false),
      reindex: jest.fn().mockResolvedValue(undefined),
    };

    module = await Test.createTestingModule({
      controllers: [SearchCurationController],
      providers: [
        { provide: SearchService, useValue: searchService },
        { provide: SearchSyncService, useValue: syncService },
        Reflector,
        PermissionsGuard,
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useClass(FakeJwtGuard)
      .compile();
  });

  afterEach(() => {
    activeUser = null;
  });

  it('rejects reindex for a user without USERS_MANAGE_ROLES (e.g. plain editor)', () => {
    activeUser = makeUser([PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE]);
    const guard = module.get(PermissionsGuard);

    // Reflector needs the prototype method to read decorator metadata.
    const handler = SearchCurationController.prototype.triggerReindex;
    const ctx = {
      getHandler: () => handler,
      getClass: () => SearchCurationController,
      switchToHttp: () => ({ getRequest: () => ({ user: activeUser }) }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows reindex for a journal manager (USERS_MANAGE_ROLES)', () => {
    activeUser = makeUser([
      PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
      PERMISSION_SLUGS.USERS_MANAGE_ROLES,
    ]);
    const guard = module.get(PermissionsGuard);

    const handler = SearchCurationController.prototype.triggerReindex;
    const ctx = {
      getHandler: () => handler,
      getClass: () => SearchCurationController,
      switchToHttp: () => ({ getRequest: () => ({ user: activeUser }) }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(ctx)).toBe(true);
  });
});
