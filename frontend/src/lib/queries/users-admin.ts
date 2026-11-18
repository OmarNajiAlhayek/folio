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

export async function fetchAdminUsers(
  params: {
    q?: string;
    role?: string;
    joinedFrom?: string;
    joinedTo?: string;
    /** `Date.getTimezoneOffset()` of the day filters, so a "day" is the viewer's day. */
    tzOffset?: number;
    limit: number;
    offset: number;
  },
  signal?: AbortSignal,
): Promise<AdminUserListResult> {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  if (params.role) sp.set('role', params.role);
  if (params.joinedFrom) sp.set('joinedFrom', params.joinedFrom);
  if (params.joinedTo) sp.set('joinedTo', params.joinedTo);
  if ((params.joinedFrom || params.joinedTo) && params.tzOffset !== undefined) {
    sp.set('tzOffset', String(params.tzOffset));
  }
  sp.set('limit', String(params.limit));
  sp.set('offset', String(params.offset));
  const qs = sp.toString();
  return apiJson<AdminUserListResult>(`/users${qs ? `?${qs}` : ''}`, {
    signal,
  });
}

/**
 * Grants or revokes single roles. The server applies them to the roles the
 * user holds now, so a page that loaded earlier cannot undo someone else's change.
 */
export async function changeUserRoles(
  userId: string,
  change: { add?: string[]; remove?: string[] },
): Promise<void> {
  await apiJson(`/users/${encodeURIComponent(userId)}/roles`, {
    method: 'PATCH',
    body: JSON.stringify(change),
  });
}

export async function createRoleInvitation(
  userId: string,
  roleSlug: 'editor' | 'journal_manager' | 'section_editor',
): Promise<{ id: string }> {
  return apiJson<{ id: string }>(
    `/users/${encodeURIComponent(userId)}/role-invitations`,
    {
      method: 'POST',
      body: JSON.stringify({ roleSlug }),
    },
  );
}

export async function cancelRoleInvitation(
  userId: string,
  invitationId: string,
): Promise<void> {
  await apiJson(
    `/users/${encodeURIComponent(userId)}/role-invitations/${encodeURIComponent(invitationId)}`,
    { method: 'DELETE' },
  );
}
