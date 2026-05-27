export const THROTTLE_PROFILE_NAMES = [
  'default',
  'public',
  'upload',
  'docx',
  'sse',
  'login',
  'register',
] as const;

export type ThrottleProfileName = (typeof THROTTLE_PROFILE_NAMES)[number];

/** Method-tier profiles: enforced after JWT via method-level `FolioThrottlerGuard`. */
export const METHOD_TIER_THROTTLE_PROFILES: readonly ThrottleProfileName[] = [
  'upload',
  'docx',
  'sse',
];

export function skipAllThrottles(): Record<string, true> {
  return Object.fromEntries(
    THROTTLE_PROFILE_NAMES.map((name) => [name, true]),
  ) as Record<string, true>;
}
