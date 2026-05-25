import { SetMetadata } from '@nestjs/common';

export const ALLOW_AUTHENTICATED_KEY = 'allow_authenticated';

/**
 * Opt out of {@link PermissionsGuard} default-deny on guarded controllers.
 * Use when a route only needs JWT authentication and per-user scoping in the
 * service layer (no role permission slug).
 */
export const AllowAuthenticated = () => SetMetadata(ALLOW_AUTHENTICATED_KEY, true);
