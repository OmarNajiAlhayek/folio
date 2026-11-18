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

export function hasPendingInvite(row: AdminUserRow, roleSlug: string): boolean {
  return row.pendingRoleInvitations.some((p) => p.roleSlug === roleSlug);
}

export function hasRole(row: AdminUserRow, roleSlug: string): boolean {
  return row.roleSlugs.includes(roleSlug);
}
