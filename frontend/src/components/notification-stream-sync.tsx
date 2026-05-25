"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useEffect, useRef } from "react";
import { toast } from "@/lib/toast";
import {
  formatNotificationBody,
  formatNotificationTitle,
} from "@/lib/format-notification";
import { openNotificationStream } from "@/lib/notifications-stream";
import type { NotificationSsePayload } from "@/lib/notifications";
import { queryKeys } from "@/lib/query-keys";
import { useMe } from "@/lib/queries/auth";

const MAX_BACKOFF_MS = 30_000;

export function NotificationStreamSync() {
  const meQuery = useMe();
  const queryClient = useQueryClient();
  const t = useTranslations("Notifications");
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const router = useRouter();
  const backoffRef = useRef(1000);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  pathnameRef.current = pathname;

  useEffect(() => {
    if (!meQuery.isSuccess || !meQuery.data) {
      return;
    }

    let cancelled = false;

    const showToast = (payload: NotificationSsePayload) => {
      if (payload.href && pathnameRef.current === payload.href) {
        return;
      }
      const title = formatNotificationTitle(t, payload.titleKey, payload.params);
      const description = formatNotificationBody(
        t,
        payload.bodyKey,
        payload.params,
      );
      toast.info(title, {
        id: payload.id,
        description: description ?? undefined,
        duration: 6000,
        action: {
          label: t("view"),
          onClick: () => {
            router.push(payload.href as "/");
          },
        },
      });
    };

    const connect = () => {
      if (cancelled) return;
      esRef.current?.close();
      const es = openNotificationStream({
        onConnected: (unreadCount) => {
          backoffRef.current = 1000;
          queryClient.setQueryData(queryKeys.notificationsUnread, {
            count: unreadCount,
          });
        },
        onNotification: (payload) => {
          void queryClient.invalidateQueries({ queryKey: ["notifications"] });
          showToast(payload);
        },
        onError: () => {
          es.close();
          if (cancelled) return;
          const delay = backoffRef.current;
          backoffRef.current = Math.min(delay * 2, MAX_BACKOFF_MS);
          reconnectTimerRef.current = setTimeout(connect, delay);
        },
      });
      esRef.current = es;
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      esRef.current?.close();
      esRef.current = null;
    };
  }, [meQuery.isSuccess, meQuery.data, queryClient, router, t]);

  return null;
}
