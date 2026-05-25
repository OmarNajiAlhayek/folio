import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Requires the authenticated user to hold at least one of the given permission
 * slugs (OR). Used with {@link PermissionsGuard}.
 *
 * A single slug means that permission is required. Multiple slugs mean any one
 * is sufficient — e.g. editor queue or reviewer assignment for review setup.
 *
 * To require every slug (AND), enforce in the service layer or add a dedicated
 * decorator when a route needs it.
 */
export const Permissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
