import { ROLE_SLUGS } from "@/lib/permissions";

export type AdminUserPendingInvitation = {
  id: string;
  roleSlug: string;
};

export type AdminUserRow = {
  id: string;
  email: string;
  displayName: string;
  affiliation: string | null;
  willingToReview: boolean;
  roleSlugs: string[];
  pendingRoleInvitations: AdminUserPendingInvitation[];
};

export type AdminUserListResult = {
  items: AdminUserRow[];
  total: number;
};

/** Merge a direct role toggle into the full role set sent to PATCH /users/:id/roles. */
export function withRoleToggle(
  current: string[],
  slug: string,
  on: boolean,
): string[] {
  const base = new Set(current);
  if (on) {
    base.add(slug);
  } else {
    base.delete(slug);
  }
  if (!base.has(ROLE_SLUGS.AUTHOR)) {
    base.add(ROLE_SLUGS.AUTHOR);
  }
  return [...base];
}

export function hasPendingInvite(
  row: AdminUserRow,
  roleSlug: string,
): boolean {
  return row.pendingRoleInvitations.some((p) => p.roleSlug === roleSlug);
}

export function hasRole(row: AdminUserRow, roleSlug: string): boolean {
  return row.roleSlugs.includes(roleSlug);
}
