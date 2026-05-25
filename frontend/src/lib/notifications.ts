export type NotificationFilter = "all" | "unread" | "read";

export type NotificationItem = {
  id: string;
  type: string;
  titleKey: string;
  bodyKey: string;
  params: Record<string, unknown>;
  href: string;
  createdAt: string;
  readAt: string | null;
};

export type NotificationListResponse = {
  items: NotificationItem[];
  nextCursor: string | null;
};

export type NotificationSsePayload = {
  id: string;
  type: string;
  titleKey: string;
  bodyKey: string;
  params: Record<string, unknown>;
  href: string;
  createdAt: string;
};
