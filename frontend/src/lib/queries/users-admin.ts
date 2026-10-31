'use client';

import { useQuery } from '@tanstack/react-query';
import { apiJson } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { AdminUserListResult } from '@/lib/users-admin';

export type JournalRoleHolder = {
  journalSlug: string;
  userId: string;
  displayName: string;
};

export function useJournalRoleHolders(roleSlug: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.journalRoleHolders(roleSlug),
    queryFn: () =>
      apiJson<JournalRoleHolder[]>(
        `/users/journal-role-holders?roleSlug=${encodeURIComponent(roleSlug)}`,
      ),
    enabled,
    staleTime: 30_000,
  });
}

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
  roleSlug: 'editor' | 'journal_manager' | 'section_editor',
): Promise<void> {
  await apiJson(`/users/${encodeURIComponent(userId)}/role-invitations`, {
    method: 'POST',
    body: JSON.stringify({ roleSlug }),
  });
}
