import { apiJson } from '@/lib/api';
import type { AdminUserListResult } from '@/lib/users-admin';

export async function fetchAdminUsers(params: {
  q?: string;
  role?: string;
  joinedFrom?: string;
  joinedTo?: string;
  limit: number;
  offset: number;
}): Promise<AdminUserListResult> {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  if (params.role) sp.set('role', params.role);
  if (params.joinedFrom) sp.set('joinedFrom', params.joinedFrom);
  if (params.joinedTo) sp.set('joinedTo', params.joinedTo);
  sp.set('limit', String(params.limit));
  sp.set('offset', String(params.offset));
  const qs = sp.toString();
  return apiJson<AdminUserListResult>(`/users${qs ? `?${qs}` : ''}`);
}

export async function patchUserRoles(
  userId: string,
  roleSlugs: string[],
): Promise<void> {
  await apiJson(`/users/${encodeURIComponent(userId)}/roles`, {
    method: 'PATCH',
    body: JSON.stringify({ roleSlugs }),
  });
}

export async function createRoleInvitation(
  userId: string,
  roleSlug: 'editor' | 'journal_manager',
): Promise<void> {
  await apiJson(`/users/${encodeURIComponent(userId)}/role-invitations`, {
    method: 'POST',
    body: JSON.stringify({ roleSlug }),
  });
}
