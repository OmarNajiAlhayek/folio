/**
 * Safe projections of `User` for API responses.
 *
 * `User` rows carry `passwordHash`, so a handler must never return one (or an
 * entity with a `User` relation loaded) directly — `@Exclude()` plus the global
 * `ClassSerializerInterceptor` is the backstop, not the plan. Map through here.
 */

export type UserSummary = {
  id: string;
  displayName: string;
  email: string;
};

/** Identity without contact details — for anonymity-sensitive contexts. */
export type UserIdentity = {
  id: string;
  displayName: string;
};

type UserLike = {
  id: string;
  displayName: string;
  email: string;
};

export function toUserSummary(user: UserLike): UserSummary;
export function toUserSummary(
  user: UserLike | null | undefined,
): UserSummary | null;
export function toUserSummary(
  user: UserLike | null | undefined,
): UserSummary | null {
  if (!user) return null;
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
  };
}

export function toUserIdentity(
  user: { id: string; displayName: string } | null | undefined,
): UserIdentity | null {
  if (!user) return null;
  return { id: user.id, displayName: user.displayName };
}
