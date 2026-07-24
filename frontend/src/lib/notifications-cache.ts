import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type {
  NotificationFilter,
  NotificationItem,
  NotificationListResponse,
} from '@/lib/notifications';
import { queryKeys } from '@/lib/query-keys';

export type NotificationsCacheSnapshot = {
  unread: { count: number } | undefined;
  lists: [
    readonly unknown[],
    InfiniteData<NotificationListResponse> | undefined,
  ][];
};

function listFilterFromQueryKey(
  key: readonly unknown[],
): NotificationFilter | null {
  if (key[0] !== 'notifications' || key[1] !== 'list') return null;
  const filter = key[2];
  if (filter === 'all' || filter === 'unread' || filter === 'read') {
    return filter;
  }
  return null;
}

function patchItemRead(
  item: NotificationItem,
  readAt: string,
): NotificationItem {
  return { ...item, readAt };
}

function applyReadToList(
  data: InfiniteData<NotificationListResponse>,
  filter: NotificationFilter,
  id: string,
  readAt: string,
  sourceItem: NotificationItem | undefined,
): InfiniteData<NotificationListResponse> {
  if (filter === 'unread') {
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        items: page.items.filter((item) => item.id !== id),
      })),
    };
  }
  if (filter === 'read') {
    if (!sourceItem) return data;
    const readItem = patchItemRead(sourceItem, readAt);
    return {
      ...data,
      pages: data.pages.map((page, index) =>
        index === 0 ? { ...page, items: [readItem, ...page.items] } : page,
      ),
    };
  }
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((item) =>
        item.id === id ? patchItemRead(item, readAt) : item,
      ),
    })),
  };
}

function applyAllReadToList(
  data: InfiniteData<NotificationListResponse>,
  filter: NotificationFilter,
  readAt: string,
): InfiniteData<NotificationListResponse> {
  return {
    ...data,
    pages: data.pages.map((page) => {
      if (filter === 'unread') {
        return { ...page, items: [] };
      }
      if (filter === 'read') {
        return page;
      }
      return {
        ...page,
        items: page.items.map((item) =>
          item.readAt ? item : patchItemRead(item, readAt),
        ),
      };
    }),
  };
}

export function snapshotNotificationsCache(
  queryClient: QueryClient,
): NotificationsCacheSnapshot {
  return {
    unread: queryClient.getQueryData<{ count: number }>(
      queryKeys.notificationsUnread,
    ),
    lists: queryClient.getQueriesData<InfiniteData<NotificationListResponse>>({
      queryKey: ['notifications', 'list'],
    }),
  };
}

export function restoreNotificationsCache(
  queryClient: QueryClient,
  snapshot: NotificationsCacheSnapshot,
): void {
  queryClient.setQueryData(queryKeys.notificationsUnread, snapshot.unread);
  for (const [key, data] of snapshot.lists) {
    queryClient.setQueryData(key, data);
  }
}

export function optimisticMarkNotificationRead(
  queryClient: QueryClient,
  id: string,
): void {
  const readAt = new Date().toISOString();

  queryClient.setQueryData<{ count: number }>(
    queryKeys.notificationsUnread,
    (old) => (old ? { count: Math.max(0, old.count - 1) } : old),
  );

  const allListData = queryClient.getQueriesData<
    InfiniteData<NotificationListResponse>
  >({ queryKey: ['notifications', 'list'] });

  // Find the item's current data so the 'read' filter can prepend it
  let sourceItem: NotificationItem | undefined;
  for (const [, data] of allListData) {
    if (!data) continue;
    for (const page of data.pages) {
      sourceItem = page.items.find((item) => item.id === id);
      if (sourceItem) break;
    }
    if (sourceItem) break;
  }

  for (const [key, data] of allListData) {
    if (!data) continue;
    const filter = listFilterFromQueryKey(key);
    if (!filter) continue;
    queryClient.setQueryData(
      key,
      applyReadToList(data, filter, id, readAt, sourceItem),
    );
  }
}

export function optimisticMarkAllNotificationsRead(
  queryClient: QueryClient,
): void {
  const readAt = new Date().toISOString();

  queryClient.setQueryData(queryKeys.notificationsUnread, { count: 0 });

  for (const [key, data] of queryClient.getQueriesData<
    InfiniteData<NotificationListResponse>
  >({ queryKey: ['notifications', 'list'] })) {
    if (!data) continue;
    const filter = listFilterFromQueryKey(key);
    if (!filter) continue;
    queryClient.setQueryData(key, applyAllReadToList(data, filter, readAt));
  }
}
