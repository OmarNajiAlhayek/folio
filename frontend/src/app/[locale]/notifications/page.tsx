'use client';

import type React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Bell, BellOff, List, Star } from 'lucide-react';
import { getNotificationVisuals } from '@/lib/notification-visuals';
import { ApiErrorState } from '@/components/api-error-state';
import {
  formatNotificationBody,
  formatNotificationTitle,
  formatRelativeTime,
} from '@/lib/format-notification';
import type { NotificationFilter, NotificationItem } from '@/lib/notifications';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationsList,
  useUnreadNotificationCount,
} from '@/lib/queries/notifications';
import { useApiErrorMessages } from '@/lib/use-api-error-messages';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonBusyRegion } from '@/components/ui/skeleton-loading-status';
import { ScrollArea } from '@/components/ui/scroll-area';

const TABS: NotificationFilter[] = ['all', 'unread', 'read'];

const getDateGroupTitle = (
  key: string,
  t: ReturnType<typeof useTranslations<'Notifications'>>,
) => {
  switch (key) {
    case 'today':
      return t('dateGroup.today');
    case 'yesterday':
      return t('dateGroup.yesterday');
    case 'thisWeek':
      return t('dateGroup.thisWeek');
    case 'older':
      return t('dateGroup.older');
    default:
      return key;
  }
};

function NotificationListSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-3 w-16 mb-3" />
        <ul className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              style={{ '--sk-delay': `${i * 75}ms` } as React.CSSProperties}
              className="rounded-xl border border-ink/5 bg-surface/60 p-4"
            >
              <div className="flex gap-4">
                <Skeleton className="size-10 shrink-0 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <Skeleton className="h-3 w-20 mb-3" />
        <ul className="space-y-2.5">
          {[0, 1].map((i) => (
            <li
              key={i}
              style={
                { '--sk-delay': `${(i + 3) * 75}ms` } as React.CSSProperties
              }
              className="rounded-xl border border-ink/5 bg-surface/60 p-4"
            >
              <div className="flex gap-4">
                <Skeleton className="size-10 shrink-0 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const t = useTranslations('Notifications');
  const locale = useLocale();
  const router = useRouter();
  const { resolve } = useApiErrorMessages();
  const [filter, setFilter] = useState<NotificationFilter>('all');

  const unreadQuery = useUnreadNotificationCount();
  const listQuery = useNotificationsList(filter);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const items = listQuery.data?.pages.flatMap((p) => p.items) ?? [];
  const unreadCount = unreadQuery.data?.count ?? 0;
  const loadError = listQuery.error ?? unreadQuery.error;

  const retryLoad = () => {
    void unreadQuery.refetch();
    void listQuery.refetch();
  };

  // Group notifications into Today, Yesterday, This Week, and Older
  const groupNotifications = (notificationItems: NotificationItem[]) => {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const startOfThisWeek = new Date(startOfToday);
    startOfThisWeek.setDate(startOfThisWeek.getDate() - 7);

    const groups: Record<string, NotificationItem[]> = {
      today: [],
      yesterday: [],
      thisWeek: [],
      older: [],
    };

    notificationItems.forEach((item) => {
      const date = new Date(item.createdAt);
      if (date >= startOfToday) {
        groups.today.push(item);
      } else if (date >= startOfYesterday) {
        groups.yesterday.push(item);
      } else if (date >= startOfThisWeek) {
        groups.thisWeek.push(item);
      } else {
        groups.older.push(item);
      }
    });

    return [
      { key: 'today', items: groups.today },
      { key: 'yesterday', items: groups.yesterday },
      { key: 'thisWeek', items: groups.thisWeek },
      { key: 'older', items: groups.older },
    ].filter((g) => g.items.length > 0);
  };

  const groupedSections = groupNotifications(items);

  if (loadError && items.length === 0 && !listQuery.isLoading) {
    return (
      <ApiErrorState
        className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6"
        title={t('pageTitle')}
        message={resolve(loadError, t('loadError'))}
        error={loadError}
        onRetry={retryLoad}
        retryLabel={t('retryLoad')}
        backHref="/dashboard"
        backLabel={t('backToDashboard')}
      />
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      {/* Header View */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-serif text-3xl font-bold text-ink">
          {t('pageTitle')}
        </h1>
        {unreadCount > 0 && filter !== 'read' && (
          <button
            type="button"
            className={cn(
              'rounded-xl border border-ink/15 bg-surface px-4 py-2 text-sm font-medium text-ink/80 transition-all duration-200',
              'hover:bg-ink/5 hover:text-ink active:scale-98 shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/35',
            )}
            disabled={markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          >
            {t('markAllRead')}
          </button>
        )}
      </div>

      {/* Stats Cards Dashboard Grid */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="relative overflow-hidden rounded-2xl border border-ink/10 dark:border-white/10 bg-surface/40 backdrop-blur-md p-5 transition-all duration-300 shadow-sm hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-ink/60">
                {t('tab.unread')}
              </p>
              {unreadQuery.isLoading ? (
                <Skeleton className="mt-2 h-8 w-12 rounded-xl" />
              ) : (
                <h3 className="mt-2 text-3xl font-serif font-bold text-ink leading-none">
                  {unreadCount}
                </h3>
              )}
            </div>
            <div
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-300',
                unreadCount > 0
                  ? 'bg-accent/15 text-accent animate-pulse'
                  : 'bg-ink/5 text-ink/40',
              )}
            >
              <Bell className="size-6 fill-current" aria-hidden />
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-ink/10 dark:border-white/10 bg-surface/40 backdrop-blur-md p-5 transition-all duration-300 shadow-sm hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-ink/60">
                {filter === 'all'
                  ? t('tab.all')
                  : filter === 'read'
                    ? t('tab.read')
                    : t('tab.unread')}
              </p>
              {listQuery.isLoading ? (
                <Skeleton className="mt-2 h-8 w-12 rounded-xl" />
              ) : (
                <h3 className="mt-2 text-3xl font-serif font-bold text-ink leading-none">
                  {items.length}
                </h3>
              )}
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink/5 text-ink/60">
              <List className="size-6" strokeWidth={1.5} aria-hidden />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs list filter */}
      <div
        className="mb-6 flex gap-1 rounded-xl border border-ink/10 bg-surface p-1 shadow-sm"
        role="tablist"
        aria-label={t('pageTitle')}
      >
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={filter === tab}
            className={cn(
              'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 cursor-pointer',
              filter === tab
                ? 'bg-accent/12 text-accent shadow-xs ring-1 ring-accent/15'
                : 'text-ink/70 hover:bg-ink/5 hover:text-ink',
            )}
            onClick={() => setFilter(tab)}
          >
            {t(`tab.${tab}`)}
          </button>
        ))}
      </div>

      {/* Load Errors */}
      {loadError && items.length > 0 && (
        <div
          className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3"
          role="alert"
        >
          <p className="text-sm text-red-900">
            {resolve(loadError, t('loadError'))}
          </p>
          <button
            type="button"
            className="mt-1 text-sm font-semibold text-accent hover:underline"
            onClick={retryLoad}
          >
            {t('retryLoad')}
          </button>
        </div>
      )}

      {/* Skeleton loading state */}
      {listQuery.isLoading && (
        <SkeletonBusyRegion label={t('loading')}>
          <NotificationListSkeleton />
        </SkeletonBusyRegion>
      )}

      {/* Empty State */}
      {!listQuery.isLoading && !loadError && items.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-ink/10 bg-surface/50 backdrop-blur-xs px-6 py-16 text-center shadow-sm">
          <div className="relative mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-accent/5 text-accent/80">
            <div className="absolute inset-0 animate-ping rounded-full bg-accent/5 opacity-75" />
            <BellOff
              className="size-10 relative z-10"
              strokeWidth={1.5}
              aria-hidden
            />
            <Star
              className="absolute -top-1 -right-1 size-5 text-amber-400 opacity-80"
              fill="currentColor"
              aria-hidden
            />
            <Star
              className="absolute bottom-2 -left-2 size-4 text-accent opacity-60"
              fill="currentColor"
              aria-hidden
            />
          </div>
          <h3 className="text-base font-serif font-semibold text-ink">
            {filter === 'unread'
              ? t('emptyUnread')
              : filter === 'read'
                ? t('emptyRead')
                : t('emptyAll')}
          </h3>
          <p className="mt-2 text-sm text-ink/50 max-w-xs leading-normal">
            {filter === 'unread'
              ? t('emptyUnreadAllRead')
              : t('emptyViewNoActivity')}
          </p>
        </div>
      )}

      {/* Date Grouped Activity Feed */}
      {!listQuery.isLoading && items.length > 0 && (
        <ScrollArea className="max-h-160 pe-2" aria-live="polite">
          <div className="space-y-6 pb-2">
            {groupedSections.map((section) => (
              <div key={section.key} className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-ink/50 px-1">
                  {getDateGroupTitle(section.key, t)}
                </h2>
                <motion.ul
                  className="space-y-2.5"
                  initial="hidden"
                  animate="visible"
                  variants={{
                    hidden: {},
                    visible: { transition: { staggerChildren: 0.05 } },
                  }}
                >
                  {section.items.map((item) => {
                    const isUnread = !item.readAt;
                    const title = formatNotificationTitle(
                      t,
                      item.titleKey,
                      item.params,
                    );
                    const body = formatNotificationBody(
                      t,
                      item.bodyKey,
                      item.params,
                    );
                    const { bg: visualBg, icon: VisualIcon } =
                      getNotificationVisuals(item.type, item.params);

                    return (
                      <motion.li
                        key={item.id}
                        variants={{
                          hidden: { opacity: 0, x: -12 },
                          visible: {
                            opacity: 1,
                            x: 0,
                            transition: {
                              type: 'spring',
                              stiffness: 300,
                              damping: 28,
                            },
                          },
                        }}
                        className={cn(
                          'group relative overflow-hidden rounded-xl border transition-all duration-300 list-none',
                          isUnread
                            ? 'border-accent/15 bg-surface shadow-[0_4px_12px_-4px_rgba(196,92,62,0.06)] hover:shadow-md hover:border-accent/30'
                            : 'border-ink/5 bg-surface/60 opacity-85 hover:opacity-100 hover:shadow-sm',
                        )}
                      >
                        <div className="flex gap-4 p-4">
                          {/* Visual Icon Badge */}
                          <div
                            className={cn(
                              'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border',
                              visualBg,
                            )}
                          >
                            <VisualIcon className="size-5" aria-hidden />
                          </div>

                          {/* Main notification body block */}
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              className="w-full text-start focus:outline-none cursor-pointer"
                              onClick={() => {
                                if (isUnread) {
                                  markRead.mutate(item.id);
                                }
                                router.push(item.href as '/');
                              }}
                            >
                              <div className="flex items-center gap-2">
                                <p
                                  className={cn(
                                    'text-sm font-semibold text-ink leading-snug',
                                    isUnread ? 'font-bold' : 'font-medium',
                                  )}
                                >
                                  {title}
                                </p>
                                {isUnread && (
                                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent animate-pulse" />
                                )}
                              </div>
                              {body && (
                                <p className="mt-1 text-sm text-ink/70 leading-relaxed wrap-break-word">
                                  {body}
                                </p>
                              )}
                              <p className="mt-2 text-xs text-ink/45">
                                <time dateTime={item.createdAt}>
                                  {formatRelativeTime(locale, item.createdAt)}
                                </time>
                              </p>
                            </button>
                          </div>

                          {/* Hover-reveal Checkmark button to Mark Read */}
                          {isUnread && (
                            <div className="flex items-center shrink-0 self-center">
                              <button
                                type="button"
                                title={t('markRead')}
                                className={cn(
                                  'flex h-8 w-8 items-center justify-center rounded-full border border-accent/20 bg-accent/5 text-accent transition-all duration-200 cursor-pointer',
                                  'hover:bg-accent hover:text-white focus:opacity-100 focus:ring-2 focus:ring-accent/35',
                                  'md:opacity-0 md:group-hover:opacity-100',
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  markRead.mutate(item.id);
                                }}
                              >
                                <Check
                                  className="size-4"
                                  strokeWidth={2.5}
                                  aria-hidden
                                />
                                <span className="sr-only">{t('markRead')}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </motion.li>
                    );
                  })}
                </motion.ul>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Pagination Load More Button */}
      {listQuery.hasNextPage && (
        <div className="mt-6 text-center">
          <button
            type="button"
            className="inline-flex min-w-28 items-center justify-center rounded-xl border border-ink/15 px-4 py-2.5 text-sm font-medium text-ink/80 hover:bg-ink/5 disabled:opacity-50 transition-all duration-200 cursor-pointer"
            disabled={listQuery.isFetchingNextPage}
            aria-busy={listQuery.isFetchingNextPage}
            aria-label={listQuery.isFetchingNextPage ? t('loading') : undefined}
            onClick={() => void listQuery.fetchNextPage()}
          >
            {listQuery.isFetchingNextPage ? (
              <Spinner size="sm" />
            ) : (
              t('loadMore')
            )}
          </button>
        </div>
      )}
    </main>
  );
}
