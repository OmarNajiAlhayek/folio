"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useState } from "react";
import { ApiErrorState } from "@/components/api-error-state";
import {
  formatNotificationBody,
  formatNotificationTitle,
  formatRelativeTime,
} from "@/lib/format-notification";
import type { NotificationFilter } from "@/lib/notifications";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationsList,
  useUnreadNotificationCount,
} from "@/lib/queries/notifications";
import { useApiErrorMessages } from "@/lib/use-api-error-messages";
import { cn } from "@/lib/utils";

const TABS: NotificationFilter[] = ["all", "unread", "read"];

export default function NotificationsPage() {
  const t = useTranslations("Notifications");
  const locale = useLocale();
  const router = useRouter();
  const { resolve } = useApiErrorMessages();
  const [filter, setFilter] = useState<NotificationFilter>("all");

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

  if (loadError && items.length === 0 && !listQuery.isLoading) {
    return (
      <ApiErrorState
        className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6"
        title={t("pageTitle")}
        message={resolve(loadError, t("loadError"))}
        error={loadError}
        onRetry={retryLoad}
        retryLabel={t("retryLoad")}
        backHref="/dashboard"
        backLabel={t("backToDashboard")}
      />
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-serif text-2xl font-semibold text-ink">
          {t("pageTitle")}
        </h1>
        {unreadCount > 0 && filter !== "read" && (
          <button
            type="button"
            className="rounded-md border border-ink/15 px-3 py-1.5 text-sm text-ink/80 hover:bg-ink/5"
            disabled={markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          >
            {t("markAllRead")}
          </button>
        )}
      </div>

      <div
        className="mb-6 flex gap-1 rounded-lg border border-ink/10 bg-surface p-1"
        role="tablist"
        aria-label={t("pageTitle")}
      >
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={filter === tab}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              filter === tab
                ? "bg-accent/12 text-accent"
                : "text-ink/70 hover:bg-ink/5 hover:text-ink",
            )}
            onClick={() => setFilter(tab)}
          >
            {t(`tab.${tab}`)}
          </button>
        ))}
      </div>

      {loadError && items.length > 0 && (
        <div className="mb-4" role="alert">
          <p className="text-sm text-red-900">
            {resolve(loadError, t("loadError"))}
          </p>
          <button
            type="button"
            className="mt-1 text-sm font-medium text-accent hover:underline"
            onClick={retryLoad}
          >
            {t("retryLoad")}
          </button>
        </div>
      )}

      {listQuery.isLoading && (
        <p className="text-sm text-ink/60">{t("loading")}</p>
      )}

      {!listQuery.isLoading && !loadError && items.length === 0 && (
        <p className="rounded-lg border border-ink/10 bg-surface px-4 py-8 text-center text-sm text-ink/60">
          {filter === "unread"
            ? t("emptyUnread")
            : filter === "read"
              ? t("emptyRead")
              : t("emptyAll")}
        </p>
      )}

      <ul className="space-y-2" aria-live="polite">
        {items.map((item) => {
          const isUnread = !item.readAt;
          const title = formatNotificationTitle(
            t,
            item.titleKey,
            item.params,
          );
          const body = formatNotificationBody(t, item.bodyKey, item.params);
          return (
            <li
              key={item.id}
              className={cn(
                "rounded-lg border border-ink/10 bg-surface px-4 py-3",
                isUnread && "ring-1 ring-accent/20",
                !isUnread && "opacity-80",
              )}
            >
              <div className="flex gap-3">
                {isUnread && (
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent"
                    aria-hidden
                  />
                )}
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    className="w-full text-start"
                    onClick={() => {
                      if (isUnread) {
                        markRead.mutate(item.id);
                      }
                      router.push(item.href as "/");
                    }}
                  >
                    <p className="text-sm font-medium text-ink">{title}</p>
                    {body && (
                      <p className="mt-1 text-sm text-ink/65">{body}</p>
                    )}
                    <p className="mt-1 text-xs text-ink/45">
                      <time dateTime={item.createdAt}>
                        {formatRelativeTime(locale, item.createdAt)}
                      </time>
                    </p>
                  </button>
                </div>
                {isUnread && (
                  <button
                    type="button"
                    className="shrink-0 self-start text-xs text-accent hover:underline"
                    onClick={() => markRead.mutate(item.id)}
                  >
                    {t("markRead")}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {listQuery.hasNextPage && (
        <div className="mt-6 text-center">
          <button
            type="button"
            className="rounded-md border border-ink/15 px-4 py-2 text-sm text-ink/80 hover:bg-ink/5"
            disabled={listQuery.isFetchingNextPage}
            onClick={() => void listQuery.fetchNextPage()}
          >
            {listQuery.isFetchingNextPage ? t("loading") : t("loadMore")}
          </button>
        </div>
      )}
    </main>
  );
}
