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
import type { NotificationFilter, NotificationItem } from "@/lib/notifications";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationsList,
  useUnreadNotificationCount,
} from "@/lib/queries/notifications";
import { useApiErrorMessages } from "@/lib/use-api-error-messages";
import { cn } from "@/lib/utils";
import { LoadingCenter, Spinner } from "@/components/ui/spinner";

const TABS: NotificationFilter[] = ["all", "unread", "read"];

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

const getDateGroupTitle = (key: string, locale: string) => {
  const isAr = locale === "ar";
  switch (key) {
    case "today":
      return isAr ? "اليوم" : "Today";
    case "yesterday":
      return isAr ? "أمس" : "Yesterday";
    case "thisWeek":
      return isAr ? "هذا الأسبوع" : "This week";
    case "older":
      return isAr ? "أقدم" : "Older";
    default:
      return key;
  }
};

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

  // Group notifications into Today, Yesterday, This Week, and Older
  const groupNotifications = (notificationItems: NotificationItem[]) => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
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
      { key: "today", items: groups.today },
      { key: "yesterday", items: groups.yesterday },
      { key: "thisWeek", items: groups.thisWeek },
      { key: "older", items: groups.older },
    ].filter((g) => g.items.length > 0);
  };

  const groupedSections = groupNotifications(items);

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
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      {/* Header View */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-serif text-3xl font-bold text-ink">
          {t("pageTitle")}
        </h1>
        {unreadCount > 0 && filter !== "read" && (
          <button
            type="button"
            className={cn(
              "rounded-xl border border-ink/15 bg-surface px-4 py-2 text-sm font-medium text-ink/80 transition-all duration-200",
              "hover:bg-ink/5 hover:text-ink active:scale-98 shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/35"
            )}
            disabled={markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          >
            {t("markAllRead")}
          </button>
        )}
      </div>

      {/* Stats Cards Dashboard Grid */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="relative overflow-hidden rounded-2xl border border-ink/10 dark:border-white/10 bg-surface/40 backdrop-blur-md p-5 transition-all duration-300 shadow-sm hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-ink/60">
                {t("tab.unread")}
              </p>
              <h3 className="mt-2 text-3xl font-serif font-bold text-ink leading-none">
                {unreadCount}
              </h3>
            </div>
            <div className={cn(
              "flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-300",
              unreadCount > 0 
                ? "bg-accent/15 text-accent animate-pulse" 
                : "bg-ink/5 text-ink/40"
            )}>
              <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M5.25 9a6.75 6.75 0 0113.5 0v.75c0 2.123.8 4.077 2.106 5.568a.75.75 0 01-.583.882H3.727a.75.75 0 01-.583-.882A9.72 9.72 0 015.25 9.75V9zm6.75 11.25a2.25 2.25 0 01-4.5 0h4.5z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-ink/10 dark:border-white/10 bg-surface/40 backdrop-blur-md p-5 transition-all duration-300 shadow-sm hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-ink/60">
                {filter === "all" ? t("tab.all") : filter === "read" ? t("tab.read") : t("tab.unread")}
              </p>
              <h3 className="mt-2 text-3xl font-serif font-bold text-ink leading-none">
                {items.length}
              </h3>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink/5 text-ink/60">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs list filter */}
      <div
        className="mb-6 flex gap-1 rounded-xl border border-ink/10 bg-surface p-1 shadow-sm"
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
              "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 cursor-pointer",
              filter === tab
                ? "bg-accent/12 text-accent shadow-xs ring-1 ring-accent/15"
                : "text-ink/70 hover:bg-ink/5 hover:text-ink",
            )}
            onClick={() => setFilter(tab)}
          >
            {t(`tab.${tab}`)}
          </button>
        ))}
      </div>

      {/* Load Errors */}
      {loadError && items.length > 0 && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3" role="alert">
          <p className="text-sm text-red-900">
            {resolve(loadError, t("loadError"))}
          </p>
          <button
            type="button"
            className="mt-1 text-sm font-semibold text-accent hover:underline"
            onClick={retryLoad}
          >
            {t("retryLoad")}
          </button>
        </div>
      )}

      {/* Loading Spinner */}
      {listQuery.isLoading && (
        <LoadingCenter label={t("loading")} className="text-ink/60 mt-12" compact />
      )}

      {/* Empty State */}
      {!listQuery.isLoading && !loadError && items.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-ink/10 bg-surface/50 backdrop-blur-xs px-6 py-16 text-center shadow-sm">
          <div className="relative mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-accent/5 text-accent/80">
            <div className="absolute inset-0 animate-ping rounded-full bg-accent/5 opacity-75" />
            <svg className="h-10 w-10 relative z-10" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a9.041 9.041 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0M3.124 7.5A8.969 8.969 0 0 1 5.292 3m13.416 0a8.969 8.969 0 0 1 2.168 4.5M19.197 10c0 2.123.8 4.077 2.107 5.568A10.017 10.017 0 0 1 12 18c-3.197 0-6.096-1.5-7.304-3.83A9.721 9.721 0 0 1 6.803 10V9c0-2.863 1.83-5.3 4.398-6.196m0 0A3 3 0 0 1 12 3c1.026 0 1.945.513 2.502 1.304M12 2.25v-.75" />
            </svg>
            <svg className="absolute -top-1 -right-1 h-5 w-5 text-amber-400 opacity-80" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9.813 15.904L9 21L13.688 18.062L18.375 21L17.563 15.904L21.563 12.356L16.219 11.906L14.375 7L12.531 11.906L7.188 12.356L11.188 15.904H9.813Z" />
            </svg>
            <svg className="absolute bottom-2 -left-2 h-4 w-4 text-accent opacity-60" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9.813 15.904L9 21L13.688 18.062L18.375 21L17.563 15.904L21.563 12.356L16.219 11.906L14.375 7L12.531 11.906L7.188 12.356L11.188 15.904H9.813Z" />
            </svg>
          </div>
          <h3 className="text-base font-serif font-semibold text-ink">
            {filter === "unread"
              ? t("emptyUnread")
              : filter === "read"
                ? t("emptyRead")
                : t("emptyAll")}
          </h3>
          <p className="mt-2 text-sm text-ink/50 max-w-xs leading-normal">
            {filter === "unread" 
              ? (locale === "ar" ? "كل إشعاراتك مقروءة بالكامل. عمل رائع!" : "All your notifications are read. Keep up the good work!")
              : (locale === "ar" ? "لم نتلقَّ أي إشعارات في هذا التصنيف بعد." : "We haven't received any activity in this view yet.")
            }
          </p>
        </div>
      )}

      {/* Date Grouped Activity Feed */}
      {!listQuery.isLoading && items.length > 0 && (
        <div className="space-y-6" aria-live="polite">
          {groupedSections.map((section) => (
            <div key={section.key} className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ink/50 px-1">
                {getDateGroupTitle(section.key, locale)}
              </h2>
              <ul className="space-y-2.5">
                {section.items.map((item) => {
                  const isUnread = !item.readAt;
                  const title = formatNotificationTitle(
                    t,
                    item.titleKey,
                    item.params,
                  );
                  const body = formatNotificationBody(t, item.bodyKey, item.params);
                  const { bg: visualBg, icon: VisualIcon } = getNotificationVisuals(item.type, item.params);

                  return (
                    <li
                      key={item.id}
                      className={cn(
                        "group relative overflow-hidden rounded-xl border transition-all duration-300 list-none",
                        isUnread 
                          ? "border-accent/15 bg-surface shadow-[0_4px_12px_-4px_rgba(196,92,62,0.06)] hover:shadow-md hover:border-accent/30" 
                          : "border-ink/5 bg-surface/60 opacity-85 hover:opacity-100 hover:shadow-sm"
                      )}
                    >
                      <div className="flex gap-4 p-4">
                        {/* Visual Icon Badge */}
                        <div className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
                          visualBg
                        )}>
                          <VisualIcon className="h-5 w-5" />
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
                              router.push(item.href as "/");
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <p className={cn(
                                "text-sm font-semibold text-ink leading-snug",
                                isUnread ? "font-bold" : "font-medium"
                              )}>
                                {title}
                              </p>
                              {isUnread && (
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent animate-pulse" />
                              )}
                            </div>
                            {body && (
                              <p className="mt-1 text-sm text-ink/70 leading-relaxed break-words">
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
                              title={t("markRead")}
                              className={cn(
                                "flex h-8 w-8 items-center justify-center rounded-full border border-accent/20 bg-accent/5 text-accent transition-all duration-200 cursor-pointer",
                                "hover:bg-accent hover:text-white focus:opacity-100 focus:ring-2 focus:ring-accent/35",
                                "md:opacity-0 md:group-hover:opacity-100" // Hide on desktop, show on hover; always show on mobile/touch
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                markRead.mutate(item.id);
                              }}
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                              </svg>
                              <span className="sr-only">{t("markRead")}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Pagination Load More Button */}
      {listQuery.hasNextPage && (
        <div className="mt-6 text-center">
          <button
            type="button"
            className="inline-flex min-w-[7rem] items-center justify-center rounded-xl border border-ink/15 px-4 py-2.5 text-sm font-medium text-ink/80 hover:bg-ink/5 disabled:opacity-50 transition-all duration-200 cursor-pointer"
            disabled={listQuery.isFetchingNextPage}
            aria-busy={listQuery.isFetchingNextPage}
            aria-label={listQuery.isFetchingNextPage ? t("loading") : undefined}
            onClick={() => void listQuery.fetchNextPage()}
          >
            {listQuery.isFetchingNextPage ? <Spinner size="sm" /> : t("loadMore")}
          </button>
        </div>
      )}
    </main>
  );
}
