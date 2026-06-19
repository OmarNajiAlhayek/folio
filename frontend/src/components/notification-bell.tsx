'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { Bell, Check } from 'lucide-react';
import { getNotificationVisuals } from '@/lib/notification-visuals';
import { NotificationsInlineError } from '@/components/notifications-inline-error';
import {
  formatNotificationBody,
  formatNotificationTitle,
  formatRelativeTime,
} from '@/lib/format-notification';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationsList,
  useUnreadNotificationCount,
} from '@/lib/queries/notifications';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';
import { SimpleTooltip } from '@/components/ui/tooltip';

export function NotificationBell() {
  const t = useTranslations('Notifications');
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadQuery = useUnreadNotificationCount();
  const listQuery = useNotificationsList('unread', { enabled: open });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const count = unreadQuery.data?.count ?? 0;
  const badgeLabel = count > 9 ? '9+' : String(count);
  const items =
    listQuery.data?.pages.flatMap((p) => p.items).slice(0, 10) ?? [];

  const loadError = unreadQuery.error ?? listQuery.error;
  const showEmpty =
    !loadError &&
    !listQuery.isLoading &&
    !unreadQuery.isLoading &&
    items.length === 0;

  const retryLoad = () => {
    void unreadQuery.refetch();
    if (open) void listQuery.refetch();
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = panel.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();
  }, [open, listQuery.isLoading, loadError]);

  const ariaLabel =
    count > 9
      ? t('bellAriaManyUnread')
      : count > 0
        ? t('bellAriaWithCount', { count })
        : t('bellAria');

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={cn(
          'relative rounded-md p-2 text-ink/75 transition-colors animate-bell-hover',
          'hover:bg-ink/6 hover:text-ink',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35',
          open && 'bg-ink/6 text-ink',
        )}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="size-5 fill-current" aria-hidden />
        {count > 0 && (
          <span
            className="absolute end-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white"
            aria-hidden
          >
            {badgeLabel}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={cn(
            'absolute end-0 z-50 mt-2 w-[min(100vw-2rem,22rem)] rounded-lg border border-ink/10 bg-surface py-2 shadow-lg ring-1 ring-ink/5',
            'notification-panel',
          )}
        >
          <div className="border-b border-ink/8 px-3 pb-2">
            <p id={titleId} className="text-sm font-semibold text-ink">
              {t('title')}
            </p>
          </div>

          {loadError ? (
            <div className="px-3 py-3">
              <NotificationsInlineError error={loadError} onRetry={retryLoad} />
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto" aria-labelledby={titleId}>
              {(listQuery.isLoading || unreadQuery.isLoading) && (
                <li className="flex justify-center px-3 py-4" aria-busy="true">
                  <Spinner size="sm" />
                  <span className="sr-only">{t('loading')}</span>
                </li>
              )}
              {showEmpty && (
                <li className="px-3 py-4 text-sm text-ink/60">
                  {t('emptyUnread')}
                </li>
              )}
              {items.map((item) => {
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
                const itemLabel = body ? `${title}. ${body}` : title;
                const { bg: visualBg, icon: VisualIcon } =
                  getNotificationVisuals(item.type, item.params);

                return (
                  <li
                    key={item.id}
                    className="group border-b border-ink/5 last:border-0 hover:bg-ink/3 transition-colors duration-150"
                  >
                    <div className="flex items-start gap-3 px-3.5 py-3">
                      {/* Visual Icon Badge */}
                      <div
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                          visualBg,
                        )}
                      >
                        <VisualIcon className="size-4" aria-hidden />
                      </div>

                      {/* Main notification body block */}
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          className="w-full text-start focus:outline-none cursor-pointer"
                          aria-label={itemLabel}
                          onClick={() => {
                            setOpen(false);
                            markRead.mutate(item.id);
                            router.push(item.href as '/');
                          }}
                        >
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold text-ink leading-snug line-clamp-1">
                              {title}
                            </p>
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent animate-pulse" />
                          </div>
                          {body && (
                            <p className="mt-0.5 line-clamp-2 text-xs text-ink/70 leading-relaxed break-words">
                              {body}
                            </p>
                          )}
                          <p className="mt-1.5 text-[10px] text-ink/45">
                            <time dateTime={item.createdAt}>
                              {formatRelativeTime(locale, item.createdAt)}
                            </time>
                          </p>
                        </button>
                      </div>

                      {/* Styled Mark as Read Button */}
                      <div className="flex items-center shrink-0 self-center">
                        <SimpleTooltip content={t('markRead')}>
                          <button
                            type="button"
                            className={cn(
                              'flex h-7 w-7 items-center justify-center rounded-full border border-accent/25 bg-accent/5 text-accent transition-all duration-150 cursor-pointer',
                              'hover:bg-accent hover:text-white focus:opacity-100 focus:ring-2 focus:ring-accent/35',
                              'opacity-0 group-hover:opacity-100 focus:opacity-100', // Hide on idle, show on hover/focus for great keyboard & touch accessibility
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              markRead.mutate(item.id);
                            }}
                          >
                            <Check className="h-3.5 w-3.5" aria-hidden />
                            <span className="sr-only">{t('markRead')}</span>
                          </button>
                        </SimpleTooltip>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink/8 px-3 pt-2">
            {count > 0 && !loadError && (
              <button
                type="button"
                className="text-xs text-ink/70 hover:text-ink hover:underline"
                disabled={markAllRead.isPending}
                onClick={() => markAllRead.mutate()}
              >
                {t('markAllRead')}
              </button>
            )}
            <Link
              href="/notifications"
              className="ms-auto text-xs font-medium text-accent hover:underline"
              onClick={() => setOpen(false)}
            >
              {t('viewNotifications')}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
