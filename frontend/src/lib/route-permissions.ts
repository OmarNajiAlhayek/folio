import { routing } from "@/i18n/routing";
import { PERMISSION_SLUGS } from "./permissions";

const LOCALES = routing.locales;

/**
 * Strip locale prefix so rules stay locale-agnostic.
 * next-intl `usePathname` is usually unprefixed; this handles `/en/...` if present.
 */
export function normalizePathname(pathname: string): string {
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const parts = p.split("/").filter(Boolean);
  if (parts[0] && LOCALES.includes(parts[0] as (typeof LOCALES)[number])) {
    const rest = parts.slice(1).join("/");
    return rest ? `/${rest}` : "/";
  }
  return p;
}

/**
 * Static route → permission map for {@link PermissionRouteGate}.
 *
 * First matching rule wins — list specific patterns before broad ones.
 * Multiple slugs on one rule mean the user needs any one (OR).
 *
 * Not listed here (by design): resource routes such as `/submissions/[slug]`,
 * where access depends on the submission and is enforced by the API.
 */
export const ROUTE_ACCESS_RULES: Array<{
  pattern: RegExp;
  permissions: string | string[];
}> = [
  {
    pattern: /^\/journal-manager\/email-settings(\/|$)/,
    permissions: PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS,
  },
  {
    pattern: /^\/journal-manager\/users(\/|$)/,
    permissions: PERMISSION_SLUGS.USERS_MANAGE_ROLES,
  },
  {
    pattern: /^\/editor(\/|$)/,
    permissions: PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
  },
  {
    pattern: /^\/assignments(\/|$)/,
    permissions: PERMISSION_SLUGS.ASSIGNMENT_VIEW_OWN,
  },
  {
    pattern: /^\/copyedit-assignments(\/|$)/,
    permissions: PERMISSION_SLUGS.COPYEDIT_VIEW_QUEUE,
  },
  {
    pattern: /^\/submissions\/?$/,
    permissions: PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN,
  },
  {
    pattern: /^\/submissions\/new(\/|$)/,
    permissions: PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN,
  },
  {
    pattern: /^\/submissions\/[^/]+\/compose(\/|$)/,
    permissions: PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN,
  },
  {
    pattern: /^\/submissions\/compose(\/|$)/,
    permissions: PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN,
  },
];

export function getRequiredPermissionsForPath(
  pathname: string,
): string | string[] | undefined {
  const norm = normalizePathname(pathname);
  for (const rule of ROUTE_ACCESS_RULES) {
    if (rule.pattern.test(norm)) {
      return rule.permissions;
    }
  }
  return undefined;
}

export function canAccessPath(
  permissionSet: Set<string>,
  pathname: string,
): boolean {
  const required = getRequiredPermissionsForPath(pathname);
  if (required === undefined) {
    return true;
  }
  const list = Array.isArray(required) ? required : [required];
  return list.some((p) => permissionSet.has(p));
}
