"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { NotificationsInlineError } from "@/components/notifications-inline-error";
import {
  formatNotificationBody,
  formatNotificationTitle,
  formatRelativeTime,
} from "@/lib/format-notification";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationsList,
  useUnreadNotificationCount,
} from "@/lib/queries/notifications";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M5.25 9a6.75 6.75 0 0113.5 0v.75c0 2.123.8 4.077 2.106 5.568a.75.75 0 01-.583.882H3.727a.75.75 0 01-.583-.882A9.72 9.72 0 015.25 9.75V9zm6.75 11.25a2.25 2.25 0 01-4.5 0h4.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// Custom Premium Icons for Notification Events
function InviteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
    </svg>
  );
}

function SubmissionIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  );
}

function DecisionIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25h.375a9 9 0 0 1 9 9v.375M10.125 2.25A3.375 3.375 0 0 1 13.5 5.625v1.5c0 .621.504 1.125 1.125 1.125h1.5a3.375 3.375 0 0 1 3.375 3.375M9 15l2.25 2.25L15 12" />
    </svg>
  );
}

function CopyeditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
    </svg>
  );
}

function QueryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
    </svg>
  );
}

function UserCheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
    </svg>
  );
}

function ReviewAcceptedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904M14.25 9h2.25M5.904 18.5c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-2.016-1.351L1.07 12.44a2.25 2.25 0 0 1 2.016-3.04h.908c.445 0 .72.498.523.898a8.963 8.963 0 0 0-.613 3.7c0 1.737.493 3.356 1.35 4.75Z" />
    </svg>
  );
}

function ReviewDeclinedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  );
}

function ReviewSubmittedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z" />
    </svg>
  );
}

function RoleInvitationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
    </svg>
  );
}

function getNotificationVisuals(type: string, params: Record<string, unknown> = {}) {
  switch (type) {
    case "review_invitation_accepted":
    case "reviewAccepted":
      return {
        bg: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-500/20",
        icon: ReviewAcceptedIcon
      };
    case "role_invitation_created":
    case "roleInvitation":
      return {
        bg: "bg-teal-500/10 text-teal-600 dark:bg-teal-500/20 dark:text-teal-400 border-teal-500/20",
        icon: RoleInvitationIcon
      };
    case "submissionDecision": {
      const decision = String(params.decision ?? "");
      if (decision === "accepted") {
        return {
          bg: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-500/20",
          icon: DecisionIcon
        };
      } else if (decision === "rejected") {
        return {
          bg: "bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400 border-rose-500/20",
          icon: DecisionIcon
        };
      } else {
        return {
          bg: "bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border-amber-500/20",
          icon: DecisionIcon
        };
      }
    }
    case "submission_submitted":
    case "submissionSubmitted":
      return {
        bg: "bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 border-blue-500/20",
        icon: SubmissionIcon
      };
    case "submission_published":
    case "submissionPublished":
      return {
        bg: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-500/20",
        icon: DecisionIcon
      };
    case "review_submitted":
    case "reviewSubmitted":
      return {
        bg: "bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 border-indigo-500/20",
        icon: ReviewSubmittedIcon
      };
    case "copyeditAssigned":
      return {
        bg: "bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 border-indigo-500/20",
        icon: CopyeditIcon
      };
    case "reviewerInvited":
      return {
        bg: "bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border-amber-500/20",
        icon: InviteIcon
      };
    case "copyeditQueries":
      return {
        bg: "bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border-amber-500/20",
        icon: QueryIcon
      };
    case "copyeditAuthorReady":
      return {
        bg: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-500/20",
        icon: UserCheckIcon
      };
    case "review_invitation_declined":
    case "reviewDeclined":
      return {
        bg: "bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400 border-rose-500/20",
        icon: ReviewDeclinedIcon
      };
    default:
      return {
        bg: "bg-accent/10 text-accent border-accent/20",
        icon: InviteIcon
      };
  }
}

export function NotificationBell() {
  const t = useTranslations("Notifications");
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadQuery = useUnreadNotificationCount();
  const listQuery = useNotificationsList("unread", { enabled: open });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const count = unreadQuery.data?.count ?? 0;
  const badgeLabel = count > 9 ? "9+" : String(count);
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
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = panel.querySelector<HTMLElement>(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex=\"-1\"])",
    );
    focusable?.focus();
  }, [open, listQuery.isLoading, loadError]);

  const ariaLabel =
    count > 9
      ? t("bellAriaManyUnread")
      : count > 0
        ? t("bellAriaWithCount", { count })
        : t("bellAria");

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={cn(
          "relative rounded-md p-2 text-ink/75 transition-colors animate-bell-hover",
          "hover:bg-ink/6 hover:text-ink",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35",
          open && "bg-ink/6 text-ink",
        )}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <BellIcon className="h-5 w-5" />
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
            "absolute end-0 z-50 mt-2 w-[min(100vw-2rem,22rem)] rounded-lg border border-ink/10 bg-surface py-2 shadow-lg ring-1 ring-ink/5",
            "notification-panel"
          )}
        >
          <div className="border-b border-ink/8 px-3 pb-2">
            <p id={titleId} className="text-sm font-semibold text-ink">
              {t("title")}
            </p>
          </div>

          {loadError ? (
            <div className="px-3 py-3">
              <NotificationsInlineError
                error={loadError}
                onRetry={retryLoad}
              />
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto" aria-labelledby={titleId}>
              {(listQuery.isLoading || unreadQuery.isLoading) && (
                <li className="flex justify-center px-3 py-4" aria-busy="true">
                  <Spinner size="sm" />
                  <span className="sr-only">{t("loading")}</span>
                </li>
              )}
              {showEmpty && (
                <li className="px-3 py-4 text-sm text-ink/60">
                  {t("emptyUnread")}
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
                const { bg: visualBg, icon: VisualIcon } = getNotificationVisuals(item.type, item.params);

                return (
                  <li
                    key={item.id}
                    className="group border-b border-ink/5 last:border-0 hover:bg-ink/3 transition-colors duration-150"
                  >
                    <div className="flex items-start gap-3 px-3.5 py-3">
                      {/* Visual Icon Badge */}
                      <div className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                        visualBg
                      )}>
                        <VisualIcon className="h-4 w-4" />
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
                            router.push(item.href as "/");
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
                        <button
                          type="button"
                          title={t("markRead")}
                          className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-full border border-accent/25 bg-accent/5 text-accent transition-all duration-150 cursor-pointer",
                            "hover:bg-accent hover:text-white focus:opacity-100 focus:ring-2 focus:ring-accent/35",
                            "opacity-0 group-hover:opacity-100 focus:opacity-100" // Hide on idle, show on hover/focus for great keyboard & touch accessibility
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            markRead.mutate(item.id);
                          }}
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                          <span className="sr-only">{t("markRead")}</span>
                        </button>
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
                {t("markAllRead")}
              </button>
            )}
            <Link
              href="/notifications"
              className="ms-auto text-xs font-medium text-accent hover:underline"
              onClick={() => setOpen(false)}
            >
              {t("viewNotifications")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
