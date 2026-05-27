import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
} from '@nestjs/throttler';
import type { ThrottlerStorage } from '@nestjs/throttler/dist/throttler-storage.interface';
import {
  METHOD_TIER_THROTTLE_PROFILES,
  THROTTLE_PROFILE_NAMES,
  type ThrottleProfileName,
} from '../throttle-profiles';
import type { RequestUser } from '../types/request-user';

/** Mirrors `@nestjs/throttler` reflector key prefixes. */
const THROTTLER_LIMIT = 'THROTTLER:LIMIT';
const THROTTLER_TTL = 'THROTTLER:TTL';
const THROTTLER_SKIP = 'THROTTLER:SKIP';
const THROTTLER_BLOCK_DURATION = 'THROTTLER:BLOCK_DURATION';
const THROTTLER_TRACKER = 'THROTTLER:TRACKER';
const THROTTLER_KEY_GENERATOR = 'THROTTLER:KEY_GENERATOR';

@Injectable()
export class FolioThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(options, storageService, reflector);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const classRef = context.getClass();

    if (await this.shouldSkip(context)) {
      return true;
    }

    if (this.allProfilesSkipped(handler, classRef)) {
      return true;
    }

    const { req } = this.getRequestResponse(context);
    const isMethodTierPass = this.hasAuthenticatedUser(req);
    const routeThrottleNames = this.getRouteThrottleNames(handler, classRef);
    const namesToCheck = this.resolveProfileNames(
      routeThrottleNames,
      isMethodTierPass,
      handler,
      classRef,
    );

    if (namesToCheck.size === 0) {
      return true;
    }

    const continues: boolean[] = [];

    for (const namedThrottler of this.throttlers) {
      const profileName = namedThrottler.name ?? 'default';
      if (!namesToCheck.has(profileName)) {
        continue;
      }

      const skip = this.reflector.getAllAndOverride<boolean>(
        THROTTLER_SKIP + profileName,
        [handler, classRef],
      );
      const skipIf = namedThrottler.skipIf || this.commonOptions.skipIf;
      if (skip || skipIf?.(context)) {
        continues.push(true);
        continue;
      }

      const routeOrClassLimit = this.reflector.getAllAndOverride<number>(
        THROTTLER_LIMIT + profileName,
        [handler, classRef],
      );
      const routeOrClassTtl = this.reflector.getAllAndOverride<number>(
        THROTTLER_TTL + profileName,
        [handler, classRef],
      );
      const routeOrClassBlockDuration = this.reflector.getAllAndOverride<number>(
        THROTTLER_BLOCK_DURATION + profileName,
        [handler, classRef],
      );
      const routeOrClassGetTracker = this.reflector.getAllAndOverride<
        (req: Record<string, unknown>, ctx: ExecutionContext) => Promise<string>
      >(THROTTLER_TRACKER + profileName, [handler, classRef]);
      const routeOrClassGetKeyGenerator = this.reflector.getAllAndOverride<
        (
          ctx: ExecutionContext,
          suffix: string,
          name: string,
        ) => string
      >(THROTTLER_KEY_GENERATOR + profileName, [handler, classRef]);

      const limit = await this.resolveThrottleValue(
        context,
        routeOrClassLimit ?? namedThrottler.limit,
      );
      const ttl = await this.resolveThrottleValue(
        context,
        routeOrClassTtl ?? namedThrottler.ttl,
      );
      const blockDuration = await this.resolveThrottleValue(
        context,
        routeOrClassBlockDuration ?? namedThrottler.blockDuration ?? ttl,
      );
      const getTracker =
        routeOrClassGetTracker ||
        namedThrottler.getTracker ||
        this.commonOptions.getTracker;
      const generateKey =
        routeOrClassGetKeyGenerator ||
        namedThrottler.generateKey ||
        this.commonOptions.generateKey;

      continues.push(
        await this.handleRequest({
          context,
          limit,
          ttl,
          throttler: namedThrottler,
          blockDuration,
          getTracker,
          generateKey,
        }),
      );
    }

    return continues.length > 0 && continues.every((cont) => cont);
  }

  protected async getTracker(
    req: Record<string, unknown>,
  ): Promise<string> {
    const user = req.user as RequestUser | undefined;
    if (user?.sub) {
      return `user:${user.sub}`;
    }
    const ip =
      typeof req.ip === 'string' && req.ip.length > 0 ? req.ip : 'unknown';
    return `ip:${ip}`;
  }

  /** @internal Exported for unit tests. */
  resolveProfileNames(
    routeThrottleNames: ThrottleProfileName[],
    isMethodTierPass: boolean,
    handler: Function,
    classRef: Function,
  ): Set<string> {
    const names = new Set<string>();

    if (isMethodTierPass) {
      for (const name of routeThrottleNames) {
        if ((METHOD_TIER_THROTTLE_PROFILES as readonly string[]).includes(name)) {
          names.add(name);
        }
      }
      return names;
    }

    if (!this.isProfileSkipped('default', handler, classRef)) {
      names.add('default');
    }

    for (const name of routeThrottleNames) {
      if (!(METHOD_TIER_THROTTLE_PROFILES as readonly string[]).includes(name)) {
        names.add(name);
      }
    }

    return names;
  }

  private allProfilesSkipped(handler: Function, classRef: Function): boolean {
    return this.throttlers.every((namedThrottler) =>
      this.isProfileSkipped(namedThrottler.name ?? 'default', handler, classRef),
    );
  }

  private isProfileSkipped(
    profileName: string,
    handler: Function,
    classRef: Function,
  ): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(THROTTLER_SKIP + profileName, [
        handler,
        classRef,
      ]) === true
    );
  }

  private getRouteThrottleNames(
    handler: Function,
    classRef: Function,
  ): ThrottleProfileName[] {
    const names = new Set<ThrottleProfileName>();

    for (const target of [handler, classRef]) {
      for (const key of Reflect.getMetadataKeys(target) ?? []) {
        if (typeof key !== 'string' || !key.startsWith(THROTTLER_LIMIT)) {
          continue;
        }
        const profileName = key.slice(THROTTLER_LIMIT.length);
        if (
          (THROTTLE_PROFILE_NAMES as readonly string[]).includes(profileName)
        ) {
          names.add(profileName as ThrottleProfileName);
        }
      }
    }

    return [...names];
  }

  private hasAuthenticatedUser(req: Record<string, unknown>): boolean {
    const user = req.user as RequestUser | undefined;
    return typeof user?.sub === 'string' && user.sub.length > 0;
  }

  private async resolveThrottleValue<T>(
    context: ExecutionContext,
    resolvableValue: T | ((ctx: ExecutionContext) => T | Promise<T>),
  ): Promise<T> {
    if (typeof resolvableValue === 'function') {
      return (resolvableValue as (ctx: ExecutionContext) => T | Promise<T>)(context);
    }
    return resolvableValue;
  }
}
