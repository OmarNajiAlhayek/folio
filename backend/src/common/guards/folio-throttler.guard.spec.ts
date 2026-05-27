import { Controller, Get, Post } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Throttle } from '@nestjs/throttler';
import { FolioThrottlerGuard } from './folio-throttler.guard';
import { skipAllThrottles } from '../throttle-profiles';
import { SkipThrottle } from '@nestjs/throttler';

describe('FolioThrottlerGuard', () => {
  const storage = {
    increment: jest.fn().mockResolvedValue({
      totalHits: 1,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    }),
  };

  const throttlers = [
    { name: 'default', ttl: 60_000, limit: 120 },
    { name: 'public', ttl: 60_000, limit: 60 },
    { name: 'upload', ttl: 60_000, limit: 20 },
    { name: 'docx', ttl: 60_000, limit: 10 },
    { name: 'sse', ttl: 60_000, limit: 10 },
    { name: 'login', ttl: 60_000, limit: 10 },
    { name: 'register', ttl: 60_000, limit: 5 },
  ];

  function createGuard(): FolioThrottlerGuard {
    const guard = new FolioThrottlerGuard(throttlers, storage as never, new Reflector());
    guard.onModuleInit();
    return guard;
  }

  @Controller('health')
  @SkipThrottle(skipAllThrottles())
  class HealthController {
    @Get()
    ok() {
      return { ok: true };
    }
  }

  @Controller('public/submissions')
  @Throttle({ public: {} })
  class PublicController {
    @Get()
    list() {
      return [];
    }
  }

  @Controller('submissions')
  class SubmissionsController {
    @Post(':slug/files')
    @Throttle({ upload: {} })
    upload() {
      return {};
    }
  }

  describe('getTracker', () => {
    it('uses user sub when authenticated', async () => {
      const guard = createGuard();
      await expect(
        guard.getTracker({ user: { sub: 'user-1' }, ip: '1.2.3.4' }),
      ).resolves.toBe('user:user-1');
    });

    it('uses ip when anonymous', async () => {
      const guard = createGuard();
      await expect(guard.getTracker({ ip: '1.2.3.4' })).resolves.toBe('ip:1.2.3.4');
    });
  });

  describe('resolveProfileNames', () => {
    const guard = createGuard();

    it('skips all profiles on health controller', () => {
      const handler = HealthController.prototype.ok;
      const names = guard.resolveProfileNames([], false, handler, HealthController);
      expect(names.size).toBe(0);
      expect(guard['allProfilesSkipped'](handler, HealthController)).toBe(true);
    });

    it('applies default and public on global pass for public controller', () => {
      const handler = PublicController.prototype.list;
      const routeNames = guard['getRouteThrottleNames'](handler, PublicController);
      expect(routeNames).toContain('public');

      const names = guard.resolveProfileNames(routeNames, false, handler, PublicController);
      expect(names).toEqual(new Set(['default', 'public']));
    });

    it('applies default only on global pass for upload route metadata', () => {
      const handler = SubmissionsController.prototype.upload;
      const routeNames = guard['getRouteThrottleNames'](handler, SubmissionsController);
      expect(routeNames).toContain('upload');

      const names = guard.resolveProfileNames(routeNames, false, handler, SubmissionsController);
      expect(names).toEqual(new Set(['default']));
    });

    it('applies upload on method-tier pass after JWT', () => {
      const handler = SubmissionsController.prototype.upload;
      const routeNames = guard['getRouteThrottleNames'](handler, SubmissionsController);

      const names = guard.resolveProfileNames(routeNames, true, handler, SubmissionsController);
      expect(names).toEqual(new Set(['upload']));
    });
  });
});
