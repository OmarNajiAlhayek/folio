import { ForbiddenException } from '@nestjs/common';
import type { RequestUser } from '../types/request-user';

/** Slug check against JWT-loaded caller permissions (sync). */
export function hasPermission(user: RequestUser, slug: string): boolean {
  return user.permissionSlugs.includes(slug);
}

/** True when the caller holds at least one listed slug (OR). */
export function hasAnyPermission(
  user: RequestUser,
  slugs: readonly string[],
): boolean {
  return slugs.some((slug) => hasPermission(user, slug));
}

/** True when the caller holds every listed slug (AND). */
export function hasEveryPermission(
  user: RequestUser,
  slugs: readonly string[],
): boolean {
  return slugs.every((slug) => hasPermission(user, slug));
}

/**
 * Enforce a caller permission in services that are also reached from seed,
 * jobs, or other non-HTTP entry points. HTTP routes should still declare
 * `@Permissions()` — see docs/authorization.md.
 */
export function assertCallerPermission(
  user: RequestUser,
  slug: string,
  message = 'Forbidden',
): void {
  if (!hasPermission(user, slug)) {
    throw new ForbiddenException({ message, code: 'FORBIDDEN' });
  }
}

/** OR variant of {@link assertCallerPermission}. */
export function assertCallerHasAnyPermission(
  user: RequestUser,
  slugs: readonly string[],
  message = 'Forbidden',
): void {
  if (!hasAnyPermission(user, slugs)) {
    throw new ForbiddenException({ message, code: 'FORBIDDEN' });
  }
}

/** AND variant — use when the HTTP guard checks only one of several required slugs. */
export function assertCallerHasEveryPermission(
  user: RequestUser,
  slugs: readonly string[],
  message = 'Forbidden',
): void {
  if (!hasEveryPermission(user, slugs)) {
    throw new ForbiddenException({ message, code: 'FORBIDDEN' });
  }
}
