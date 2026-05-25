import { apiUrl } from "@/lib/api";
import type { NotificationSsePayload } from "@/lib/notifications";

export type NotificationStreamHandlers = {
  onConnected?: (unreadCount: number) => void;
  onNotification?: (payload: NotificationSsePayload) => void;
  onError?: () => void;
};

export function openNotificationStream(
  handlers: NotificationStreamHandlers,
): EventSource {
  const es = new EventSource(apiUrl("/notifications/stream"), {
    withCredentials: true,
  });

  es.addEventListener("connected", (ev) => {
    try {
      const data = JSON.parse((ev as MessageEvent).data) as {
        unreadCount?: number;
      };
      handlers.onConnected?.(data.unreadCount ?? 0);
    } catch {
      handlers.onConnected?.(0);
    }
  });

  es.addEventListener("notification", (ev) => {
    try {
      const payload = JSON.parse(
        (ev as MessageEvent).data,
      ) as NotificationSsePayload;
      handlers.onNotification?.(payload);
    } catch {
      /* ignore malformed */
    }
  });

  es.onerror = () => {
    handlers.onError?.();
  };

  return es;
}
