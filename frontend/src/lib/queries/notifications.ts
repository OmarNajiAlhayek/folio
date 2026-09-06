'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiJson } from '@/lib/api';
import type {
  NotificationFilter,
  NotificationItem,
  NotificationListResponse,
} from '@/lib/notifications';
import {
  optimisticMarkAllNotificationsRead,
  optimisticMarkNotificationRead,
  restoreNotificationsCache,
  snapshotNotificationsCache,
} from '@/lib/notifications-cache';
import { queryKeys } from '@/lib/query-keys';

export function useUnreadNotificationCount(enabled = true) {
  return useQuery({
    queryKey: queryKeys.notificationsUnread,
    queryFn: () => apiJson<{ count: number }>('/notifications/unread-count'),
    enabled,
    staleTime: 15_000,
    // SSE (NotificationStreamSync) owns the live count; a focus refetch
    // just repeats GET /notifications/unread-count on every tab switch.
    refetchOnWindowFocus: false,
  });
}

export function useNotificationsList(
  filter: NotificationFilter,
  options?: { enabled?: boolean },
) {
  return useInfiniteQuery({
    queryKey: queryKeys.notifications(filter),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ filter, limit: '20' });
      if (pageParam) params.set('cursor', String(pageParam));
      return apiJson<NotificationListResponse>(
        `/notifications?${params.toString()}`,
      );
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 15_000,
    enabled: options?.enabled ?? true,
    // SSE already invalidates the list; a focus refetch repeats GET /notifications.
    refetchOnWindowFocus: false,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiJson<NotificationItem>(`/notifications/${id}/read`, {
        method: 'PATCH',
      }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] });
      const snapshot = snapshotNotificationsCache(queryClient);
      optimisticMarkNotificationRead(queryClient, id);
      return { snapshot };
    },
    onError: (_err, _id, context) => {
      if (context?.snapshot) {
        restoreNotificationsCache(queryClient, context.snapshot);
      }
    },
    onSettled: () => {
      // Optimistic unread + list patches already ran; only refresh lists.
      void queryClient.invalidateQueries({
        queryKey: ['notifications', 'list'],
      });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiJson<{ updated: number }>('/notifications/read-all', {
        method: 'PATCH',
      }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] });
      const snapshot = snapshotNotificationsCache(queryClient);
      optimisticMarkAllNotificationsRead(queryClient);
      return { snapshot };
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) {
        restoreNotificationsCache(queryClient, context.snapshot);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ['notifications', 'list'],
      });
    },
  });
}
