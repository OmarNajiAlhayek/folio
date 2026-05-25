import type { useTranslations } from "next-intl";

type NotificationsTranslator = ReturnType<
  typeof useTranslations<"Notifications">
>;

export function formatNotificationTitle(
  t: NotificationsTranslator,
  titleKey: string,
  params: Record<string, unknown>,
): string {
  const key = titleKey.replace(/^Notifications\./, "");
  try {
    return t(key as Parameters<NotificationsTranslator>[0], params as never);
  } catch {
    return titleKey;
  }
}

export function formatNotificationBody(
  t: NotificationsTranslator,
  bodyKey: string,
  params: Record<string, unknown>,
): string | null {
  const key = bodyKey.replace(/^Notifications\./, "");
  try {
    const text = t(key as Parameters<NotificationsTranslator>[0], params as never);
    return text && text !== bodyKey ? text : null;
  } catch {
    return null;
  }
}

export function formatRelativeTime(
  locale: string,
  iso: string,
): string {
  const date = new Date(iso);
  const diffMs = date.getTime() - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, "second");
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return rtf.format(diffHr, "hour");
  const diffDay = Math.round(diffHr / 24);
  return rtf.format(diffDay, "day");
}
