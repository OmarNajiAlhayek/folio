"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@/i18n/navigation";
import { apiJson } from "@/lib/api";
import { ApiErrorState } from "@/components/api-error-state";
import { useMe } from "@/lib/queries/auth";
import { queryKeys } from "@/lib/query-keys";
import { toast } from "@/lib/toast";
import { useApiErrorMessages } from "@/lib/use-api-error-messages";
import { useToastApiError } from "@/lib/use-toast-api-error";
import type { MeProfile } from "@/lib/permissions";
import {
  canBrowseAuthorSubmissionsNav,
  PERMISSION_SLUGS,
  ROLE_SLUGS,
} from "@/lib/permissions";
import { PAGE_SHELL } from "@/lib/page-shell";
import { Spinner } from "@/components/ui/spinner";
import { SimpleSelect } from "@/components/ui/select";
import { formatSubmissionUpdatedAt } from "@/lib/submission-list-ui";

function RowChevron() {
  return (
    <svg
      className="size-4 shrink-0 text-ink/35 transition-all duration-300 group-hover:translate-x-1 group-hover:text-accent rtl:rotate-180 rtl:group-hover:-translate-x-1"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
        clipRule="evenodd"
      />
    </svg>
  );
}

type ReviewInviteRow = {
  id: string;
  slug: string | null;
  status: string;
  assignedAt?: string;
  submission?: { title: string };
};

type RoleInviteRow = {
  id: string;
  roleSlug: string;
  createdAt: string;
  invitedBy: { displayName: string; email: string };
};

export default function DashboardPage() {
  const t = useTranslations("Dashboard");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const meQuery = useMe();
  const me = meQuery.data ?? null;
  const [reviewInvites, setReviewInvites] = useState<ReviewInviteRow[]>([]);
  const [roleInvites, setRoleInvites] = useState<RoleInviteRow[]>([]);
  const [invitesLoaded, setInvitesLoaded] = useState(false);
  const [roleBusyId, setRoleBusyId] = useState<string | null>(null);
  const [emailPref, setEmailPref] = useState<"" | "en" | "ar">("");
  const [emailPrefBusy, setEmailPrefBusy] = useState(false);
  const { resolve: resolveApiError } = useApiErrorMessages();
  const tApi = useTranslations("ApiErrors");
  const showApiError = useToastApiError();

  useEffect(() => {
    if (!me) return;
    const p = me.preferredLocale;
    setEmailPref(p === "en" || p === "ar" ? p : "");
  }, [me]);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    setInvitesLoaded(false);
    const loads: Promise<void>[] = [];

    if (me.permissions.includes(PERMISSION_SLUGS.ASSIGNMENT_VIEW_OWN)) {
      loads.push(
        apiJson<ReviewInviteRow[]>("/assignments/me")
          .then((rows) => {
            if (!cancelled) {
              setReviewInvites(rows.filter((r) => r.status === "invited"));
            }
          })
          .catch(() => {
            if (!cancelled) setReviewInvites([]);
          }),
      );
    } else if (!cancelled) {
      setReviewInvites([]);
    }

    loads.push(
      apiJson<RoleInviteRow[]>("/users/me/role-invitations")
        .then((rows) => {
          if (!cancelled) setRoleInvites(rows);
        })
        .catch(() => {
          if (!cancelled) setRoleInvites([]);
        }),
    );

    Promise.all(loads).finally(() => {
      if (!cancelled) setInvitesLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [me]);

  async function acceptRoleInvite(id: string) {
    setRoleBusyId(id);
    try {
      await apiJson(`/role-invitations/${id}/accept`, { method: "POST" });
      const [profile, roles] = await Promise.all([
        apiJson<MeProfile>("/auth/me"),
        apiJson<RoleInviteRow[]>("/users/me/role-invitations"),
      ]);
      queryClient.setQueryData(queryKeys.me, profile);
      setRoleInvites(roles);
      toast.success(t("roleInviteAccepted"));
    } catch (err) {
      showApiError(err, t("roleInviteAcceptFailed"), {
        id: "dashboard-role-invite-accept",
      });
    } finally {
      setRoleBusyId(null);
    }
  }

  async function declineRoleInvite(id: string) {
    setRoleBusyId(id);
    try {
      await apiJson(`/role-invitations/${id}/decline`, { method: "POST" });
      setRoleInvites(await apiJson<RoleInviteRow[]>("/users/me/role-invitations"));
      toast.success(t("roleInviteDeclined"));
    } catch (err) {
      showApiError(err, t("roleInviteDeclineFailed"), {
        id: "dashboard-role-invite-decline",
      });
    } finally {
      setRoleBusyId(null);
    }
  }

  async function saveEmailPref() {
    setEmailPrefBusy(true);
    try {
      await apiJson("/auth/me", {
        method: "PATCH",
        body: JSON.stringify({
          preferredLocale: emailPref === "" ? null : emailPref,
        }),
      });
      const profile = await apiJson<MeProfile>("/auth/me");
      queryClient.setQueryData(queryKeys.me, profile);
      toast.success(t("emailLanguageSaved"));
    } catch (err) {
      showApiError(err, t("emailLanguageSaveFailed"), {
        id: "dashboard-email-pref",
      });
    } finally {
      setEmailPrefBusy(false);
    }
  }

  if (meQuery.isError) {
    return (
      <ApiErrorState
        className={PAGE_SHELL}
        message={resolveApiError(meQuery.error, t("loadFailed"))}
        error={meQuery.error}
        onRetry={() => void meQuery.refetch()}
        retryLabel={tApi("retry")}
      />
    );
  }

  if (!me) {
    return null;
  }

  const canEditorQueue = me.permissions.includes(
    PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
  );
  const canAssignments = me.permissions.includes(
    PERMISSION_SLUGS.ASSIGNMENT_VIEW_OWN,
  );

  const initial =
    me.displayName?.trim()?.charAt(0)?.toLocaleUpperCase() ?? "?";

  const links = [
    ...(canBrowseAuthorSubmissionsNav(me.permissions)
      ? [{ href: "/submissions", label: t("mySubmissions") } as const]
      : []),
    ...(canEditorQueue
      ? [{ href: "/editor", label: t("editorQueue") } as const]
      : []),
    ...(canAssignments
      ? [{ href: "/assignments", label: t("myReviewAssignments") } as const]
      : []),
    { href: "/publications", label: t("publicCatalog") },
  ];

  const hasPendingInvites =
    invitesLoaded &&
    (reviewInvites.length > 0 || roleInvites.length > 0);

  // Dynamic details and icons for descriptive cards
  const getLinkDetails = (href: string) => {
    const isAr = locale === "ar";
    switch (href) {
      case "/submissions":
        return {
          description: isAr
            ? "تقديم مسودات جديدة، وتتبع التنقيحات، وإدارة مخطوطاتك النشطة."
            : "Submit new drafts, track revisions, and manage your active manuscripts.",
          colorClass: "from-indigo-500/10 to-indigo-500/5 dark:from-indigo-500/15 dark:to-indigo-500/5 text-indigo-600 dark:text-indigo-400 group-hover:border-indigo-500/35",
          glowClass: "hover-glow-indigo",
          iconBg: "bg-indigo-500/12 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400",
          icon: (
            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          )
        };
      case "/editor":
        return {
          description: isAr
            ? "تقييم المخطوطات الواردة، وتعيين المحكمين الأقران، وتسجيل القرارات التحريرية."
            : "Evaluate incoming submissions, assign peer reviewers, and record editorial decisions.",
          colorClass: "from-accent/10 to-accent/5 dark:from-accent/15 dark:to-accent/5 text-accent group-hover:border-accent/35",
          glowClass: "hover-glow-accent",
          iconBg: "bg-accent/12 text-accent dark:bg-accent/20 dark:text-accent",
          icon: (
            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25A2.25 2.25 0 0113.5 8.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
          )
        };
      case "/assignments":
        return {
          description: isAr
            ? "الوصول إلى المخطوطات المعينة، وتنزيل حزم التحكيم، وتقديم تقارير التقييم."
            : "Access assigned manuscripts, download review packages, and submit your evaluation reports.",
          colorClass: "from-emerald-500/10 to-emerald-500/5 dark:from-emerald-500/15 dark:to-emerald-500/5 text-emerald-600 dark:text-emerald-400 group-hover:border-emerald-500/35",
          glowClass: "hover-glow-emerald",
          iconBg: "bg-emerald-500/12 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
          icon: (
            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-.621-.504-1.125-1.125-1.125H9.75M8.25 21h8.25c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H8.25c-.621 0-1.125.504-1.125 1.125v14.25c0 .621.504 1.125 1.125 1.125z" />
            </svg>
          )
        };
      default:
        return {
          description: isAr
            ? "تصفح المقالات المحكمة، وابحث في العناوين والملخصات، واقرأ الأعمال المنشورة."
            : "Browse peer-reviewed articles, search titles and abstracts, and read published work.",
          colorClass: "from-amber-500/10 to-amber-500/5 dark:from-amber-500/15 dark:to-amber-500/5 text-amber-600 dark:text-amber-400 group-hover:border-amber-500/35",
          glowClass: "hover-glow-amber",
          iconBg: "bg-amber-500/12 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
          icon: (
            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-.778.099-1.533.284-2.253" />
            </svg>
          )
        };
    }
  };

  // Safe localized role pills
  const getRoleLabel = (role: string) => {
    const isAr = locale === "ar";
    switch (role) {
      case ROLE_SLUGS.AUTHOR:
        return {
          label: isAr ? "مؤلف" : "Author",
          classes: "bg-indigo-50 border-indigo-200/60 text-indigo-700 dark:bg-indigo-500/10 dark:border-indigo-500/20 dark:text-indigo-400"
        };
      case ROLE_SLUGS.REVIEWER:
        return {
          label: isAr ? "مُحكّم" : "Reviewer",
          classes: "bg-emerald-50 border-emerald-200/60 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400"
        };
      case ROLE_SLUGS.EDITOR:
        return {
          label: isAr ? "محرر" : "Editor",
          classes: "bg-orange-50 border-orange-200/60 text-orange-700 dark:bg-orange-500/10 dark:border-orange-500/20 dark:text-orange-400"
        };
      case ROLE_SLUGS.JOURNAL_MANAGER:
        return {
          label: isAr ? "مدير المجلة" : "Journal Manager",
          classes: "bg-amber-50 border-amber-200/60 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400"
        };
      case ROLE_SLUGS.COPYEDITOR:
        return {
          label: isAr ? "مدقق لغوي" : "Copyeditor",
          classes: "bg-sky-50 border-sky-200/60 text-sky-700 dark:bg-sky-500/10 dark:border-sky-500/20 dark:text-sky-400"
        };
      default:
        return {
          label: role,
          classes: "bg-ink/5 border-ink/10 text-ink/75 dark:bg-white/5 dark:border-white/10 dark:text-white/70"
        };
    }
  };

  return (
    <main className={PAGE_SHELL}>
      {/* Dynamic Header */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between border-s-4 border-s-accent/70 ps-5 mb-8">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            {t("title")}
          </h1>
          <p className="mt-1.5 text-sm text-ink/65">
            {locale === "ar"
              ? "مرحباً بك في مساحة عملك التحريرية والعلمية المخصصة."
              : "Welcome to your personalized scholarly and editorial workspace."}
          </p>
        </div>
        <div
          className="mt-4 h-px md:hidden bg-linear-to-r from-accent/60 to-transparent"
          aria-hidden
        />
      </header>

      {/* Top Section Grid: Hero Profile Workspace Card + Quick Actions */}
      <div className="grid gap-6 lg:grid-cols-12 mb-8">
        
        {/* User Card: Occupies 5 columns on large screens */}
        <div className="lg:col-span-5 relative group overflow-hidden rounded-2xl border border-accent-2/15 bg-linear-to-br from-surface via-surface-muted/95 to-accent-2/[0.03] p-6 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.06),0_8px_32px_-16px_rgba(15,23,42,0.12)] dark:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.3)] dark:ring-white/[0.04] transition-all duration-300 hover:shadow-md hover:border-accent-2/30">
          {/* Subtle design blobs inside the user card */}
          <div className="pointer-events-none absolute inset-0 opacity-[0.35] mix-blend-soft-light dark:opacity-20" aria-hidden>
            <div className="absolute -start-1/4 -top-1/3 h-[90%] w-[60%] rounded-full bg-[radial-gradient(closest-side,var(--accent),transparent_72%)]" />
            <div className="absolute -bottom-1/3 -end-1/4 h-[75%] w-[50%] rounded-full bg-[radial-gradient(closest-side,var(--accent-2),transparent_70%)]" />
          </div>

          <div className="relative flex flex-col sm:flex-row items-center sm:items-start gap-5">
            {/* Glowing Avatar Border Container */}
            <div
              className="flex size-20 shrink-0 items-center justify-center rounded-full bg-linear-to-tr from-accent to-accent-2 p-[2.5px] shadow-sm transform transition-all duration-500 group-hover:rotate-6"
              aria-hidden
            >
              <div className="flex h-full w-full items-center justify-center rounded-full bg-surface text-3xl font-semibold text-accent dark:bg-surface-muted">
                {initial}
              </div>
            </div>

            <div className="min-w-0 flex-1 text-center sm:text-start">
              <span className="inline-flex rounded-full bg-accent/8 dark:bg-accent/18 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                {t("signedInAs")}
              </span>
              <p className="mt-1.5 text-2xl font-serif font-semibold leading-tight text-ink tracking-tight break-words">
                {me.displayName}
              </p>
              <p className="mt-1 text-sm text-ink/65 break-all select-all hover:text-accent transition-colors duration-200">
                {me.email}
              </p>
            </div>
          </div>

          {/* User Roles Pill Showcase */}
          <div className="relative mt-6 pt-5 border-t border-ink/[0.07] dark:border-white/[0.07]">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/40 mb-3">
              {locale === "ar" ? "أدوارك النشطة" : "Your Active Roles"}
            </p>
            <div className="flex flex-wrap gap-2">
              {me.roles && me.roles.length > 0 ? (
                me.roles.map((role) => {
                  const details = getRoleLabel(role);
                  return (
                    <span
                      key={role}
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold shadow-xs ${details.classes}`}
                    >
                      <span className="mr-1.5 rtl:ml-1.5 rtl:mr-0 size-1.5 rounded-full bg-current opacity-70 animate-pulse" />
                      {details.label}
                    </span>
                  );
                })
              ) : (
                <span className="inline-flex items-center rounded-full border border-ink/10 bg-surface-muted px-3 py-1 text-xs font-medium text-ink/50">
                  {locale === "ar" ? "حساب بدون أدوار" : "No active roles"}
                </span>
              )}

              {/* Review status badge indicator */}
              {me.willingToReview && (
                <span className="inline-flex items-center rounded-full border border-emerald-500/25 bg-emerald-500/8 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="relative mr-1.5 rtl:ml-1.5 rtl:mr-0 flex size-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full size-2 bg-emerald-500"></span>
                  </span>
                  {locale === "ar" ? "مستعد للتحكيم" : "Willing to Review"}
                </span>
              )}
            </div>
          </div>

          {/* Affiliation & ORCID slots */}
          {(me.affiliation || me.orcid) && (
            <div className="relative mt-4 space-y-2 text-xs text-ink/60 bg-ink/[0.02] dark:bg-white/[0.02] rounded-xl p-3 border border-ink/[0.04] dark:border-white/[0.04]">
              {me.affiliation && (
                <div className="flex items-start gap-2">
                  <svg className="size-4 shrink-0 mt-0.5 text-accent-2 opacity-75" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
                  </svg>
                  <span className="font-medium truncate" title={me.affiliation}>{me.affiliation}</span>
                </div>
              )}
              {me.orcid && (
                <div className="flex items-center gap-2">
                  <span className="shrink-0 size-4 flex items-center justify-center rounded-full bg-[#A6C307] text-[8px] font-bold text-white tracking-tighter">iD</span>
                  <span className="font-mono tracking-wide">{me.orcid}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick Actions Grid: Occupies 7 columns on large screens */}
        <div className="lg:col-span-7 flex flex-col justify-between">
          <div>
            <h2 className="font-sans text-xs font-semibold uppercase tracking-wider text-ink/45 mb-4 px-1">
              {locale === "ar" ? "الوصول السريع للأقسام" : "Quick Access Workspace"}
            </h2>
            <nav aria-label={t("title")}>
              <ul className="grid gap-4 sm:grid-cols-2">
                {links.map(({ href, label }) => {
                  const details = getLinkDetails(href);
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        className={`group relative flex flex-col h-full rounded-2xl border border-ink/10 dark:border-white/10 bg-gradient-to-br ${details.colorClass} ${details.glowClass} p-5 text-start shadow-xs transition-all duration-300 hover:-translate-y-1`}
                      >
                        <div className="flex items-center justify-between gap-4 mb-2.5">
                          <div className={`flex size-9 items-center justify-center rounded-xl transition-all duration-300 ${details.iconBg} group-hover:scale-110`}>
                            {details.icon}
                          </div>
                          <RowChevron />
                        </div>
                        <span className="font-serif text-lg font-semibold text-ink group-hover:text-accent transition-colors duration-200">
                          {label}
                        </span>
                        <p className="mt-1.5 text-xs leading-relaxed text-ink/65">
                          {details.description}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
        </div>

      </div>

      {/* Bottom Layout Grid: Two columns */}
      <div className="grid gap-6 md:grid-cols-2">
        
        {/* Left Column: Email language settings & Guidance tips */}
        <div className="space-y-6">
          
          {/* Email language setting */}
          <section
            className="rounded-2xl border border-ink/10 dark:border-white/10 bg-surface p-6 shadow-sm transition-all duration-300 hover:shadow-[0_4px_16px_rgba(15,23,42,0.02)]"
            aria-labelledby="email-pref-heading"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/8 text-accent" aria-hidden>
                <svg className="size-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
              <h2
                id="email-pref-heading"
                className="font-sans text-sm font-semibold text-ink"
              >
                {t("emailLanguageTitle")}
              </h2>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink/65">{t("emailLanguageHint")}</p>
            
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[140px]">
                <SimpleSelect
                  value={emailPref}
                  onValueChange={(val) => setEmailPref(val as "" | "en" | "ar")}
                  placeholder={t("emailLanguageAuto")}
                  options={[
                    { value: "", label: t("emailLanguageAuto") },
                    { value: "en", label: t("emailLanguageEn") },
                    { value: "ar", label: t("emailLanguageAr") },
                  ]}
                />
              </div>

              {/* Dynamic badge indicating currently active setting */}
              <div className="text-xs font-semibold px-2.5 py-2 rounded-lg bg-surface-muted border border-ink/[0.04]">
                {emailPref === "en" ? "🇺🇸 English" : emailPref === "ar" ? "🇸🇾 العربية" : "⚙️ Auto"}
              </div>

              <button
                type="button"
                disabled={emailPrefBusy}
                aria-busy={emailPrefBusy}
                aria-label={emailPrefBusy ? t("emailLanguageSaving") : undefined}
                onClick={() => void saveEmailPref()}
                className="inline-flex min-w-[7rem] items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-xs hover:brightness-105 active:scale-[0.98] disabled:opacity-50 transition-all duration-200"
              >
                {emailPrefBusy ? <Spinner size="sm" className="border-ink/30 border-t-white" /> : t("emailLanguageSave")}
              </button>
            </div>
          </section>

          {/* Guidelines Tips box to cover white space beautifully */}
          <section
            className="rounded-2xl border border-ink/10 dark:border-white/10 bg-linear-to-b from-surface to-surface-muted/30 p-6 shadow-sm"
            aria-labelledby="tips-heading"
          >
            <h2 id="tips-heading" className="font-serif text-base font-semibold text-ink flex items-center gap-2">
              <span className="text-accent" aria-hidden>💡</span>
              {locale === "ar" ? "نصائح مساحة العمل" : "Workspace Tips & Guides"}
            </h2>
            <div className="h-px bg-linear-to-r from-accent/30 via-accent-2/15 to-transparent mt-3 mb-4" aria-hidden />
            
            <ul className="space-y-3.5 text-xs text-ink/75 leading-relaxed">
              <li className="flex gap-2.5 items-start">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold">1</span>
                <div>
                  <strong className="text-ink">{locale === "ar" ? "منشئ النصوص" : "Word Constructor:"}</strong>{" "}
                  {locale === "ar" 
                    ? "ابنِ مخطوطتك قسماً بقسم في المتصفح. وسيقوم النظام تلقائياً بإنشاء ملف .docx منسق ومطابق لمعايير المجلة."
                    : "Build your manuscript block-by-block. The system automatically compiles a perfectly styled .docx for you."}
                </div>
              </li>
              <li className="flex gap-2.5 items-start">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">2</span>
                <div>
                  <strong className="text-ink">{locale === "ar" ? "اهتمامات التحكيم" : "Willing to Review:"}</strong>{" "}
                  {locale === "ar"
                    ? "تأكد من تحديث اهتماماتك التحكيمية وخبراتك العلمية في حسابك الشخصي لتلقي تنبيهات ودعوات التحكيم من المحررين."
                    : "Keep your review keywords up to date on your profile. This helps handling editors invite you to relevant peer reviews."}
                </div>
              </li>
              <li className="flex gap-2.5 items-start">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent font-bold">3</span>
                <div>
                  <strong className="text-ink">{locale === "ar" ? "حزمة الملفات" : "Files Package:"}</strong>{" "}
                  {locale === "ar"
                    ? "عند إرسال بحث للتحكيم، قم برفع الأشكال التوضيحية والجداول كملفات مستقلة ذات دقة عالية لضمان أفضل إخراج صحفي."
                    : "When preparing submissions, upload high-resolution figures and tables separately to ensure premium layout output."}
                </div>
              </li>
            </ul>
          </section>

        </div>

        {/* Right Column: Pending invitations OR visual Empty State (no blank space!) */}
        <div>
          
          {hasPendingInvites ? (
            <section
              className="h-full rounded-2xl border border-s-4 border-s-accent/35 border-ink/10 dark:border-white/10 bg-surface p-6 shadow-sm"
              aria-labelledby="pending-invites-heading"
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <h2
                    id="pending-invites-heading"
                    className="font-serif text-xl font-semibold text-ink"
                  >
                    {t("pendingInvitationsTitle")}
                  </h2>
                  {/* Glowing micro-animation dot */}
                  <span className="relative flex size-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                    <span className="relative inline-flex rounded-full size-2 bg-accent"></span>
                  </span>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                  {(reviewInvites.length + roleInvites.length)}
                </span>
              </div>
              
              <p className="text-xs text-ink/60 pb-4 border-b border-ink/[0.06] dark:border-white/[0.06]">
                {t("pendingInvitationsHint")}
              </p>

              {reviewInvites.length > 0 && (
                <div className="mt-5">
                  <h3 className="font-sans text-[10px] font-bold uppercase tracking-wider text-ink/40">
                    {t("subsectionReviewInvites")}
                  </h3>
                  <ul className="mt-3 space-y-3">
                    {reviewInvites.map((r) => {
                      const slug = r.slug?.trim();
                      const dateStr = r.assignedAt
                        ? formatSubmissionUpdatedAt(r.assignedAt, locale)
                        : "";
                      return (
                        <li
                          key={r.id}
                          className="group flex flex-col gap-4 rounded-xl border border-ink/10 dark:border-white/10 bg-surface-muted/50 p-4 transition-all duration-200 hover:border-accent/25 hover:bg-surface-muted/80 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="font-serif text-base font-semibold text-ink group-hover:text-accent transition-colors duration-200 truncate" title={r.submission?.title}>
                              {r.submission?.title ?? t("untitledSubmission")}
                            </p>
                            {dateStr ? (
                              <p className="mt-1 text-[11px] text-ink/50 flex items-center gap-1">
                                <span className="text-accent-2">📅</span>
                                {t("invitedAt", { date: dateStr })}
                              </p>
                            ) : null}
                          </div>
                          {slug ? (
                            <Link
                              href={`/assignments/${encodeURIComponent(slug)}/invite`}
                              className="inline-flex shrink-0 items-center justify-center rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white shadow-xs hover:brightness-105 active:scale-[0.98] transition-all duration-200"
                            >
                              {t("respondToReviewInvite")}
                            </Link>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {roleInvites.length > 0 && (
                <div className="mt-5">
                  <h3 className="font-sans text-[10px] font-bold uppercase tracking-wider text-ink/40">
                    {t("subsectionRoleInvites")}
                  </h3>
                  <ul className="mt-3 space-y-3">
                    {roleInvites.map((r) => {
                      const dateStr = formatSubmissionUpdatedAt(
                        r.createdAt,
                        locale,
                      );
                      const busy = roleBusyId === r.id;
                      return (
                        <li
                          key={r.id}
                          className="flex flex-col gap-4 rounded-xl border border-ink/10 dark:border-white/10 bg-surface-muted/50 p-4 transition-all duration-200 hover:bg-surface-muted/80 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-ink text-sm leading-normal">
                              {r.roleSlug === "editor"
                                ? t("roleInviteEditorLine", {
                                    name: r.invitedBy.displayName,
                                  })
                                : r.roleSlug === "journal_manager"
                                  ? t("roleInviteJournalManagerLine", {
                                      name: r.invitedBy.displayName,
                                    })
                                  : t("roleInviteGenericLine", {
                                      name: r.invitedBy.displayName,
                                      roleSlug: r.roleSlug,
                                    })}
                            </p>
                            <p className="mt-1 text-[11px] text-ink/50 flex items-center gap-1">
                              <span>📅</span>
                              {t("invitedAt", { date: dateStr })}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              aria-busy={busy}
                              aria-label={busy ? t("working") : undefined}
                              onClick={() => void acceptRoleInvite(r.id)}
                              className="inline-flex min-w-[5.5rem] items-center justify-center rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:brightness-105 active:scale-[0.98] disabled:opacity-50 transition-all duration-200"
                            >
                              {busy ? <Spinner size="sm" className="border-ink/30 border-t-white" /> : t("acceptRole")}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void declineRoleInvite(r.id)}
                              className="rounded-lg border border-ink/20 dark:border-white/20 bg-paper/60 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-ink/5 active:scale-[0.98] disabled:opacity-50 transition-all duration-200"
                            >
                              {t("declineRole")}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </section>
          ) : (
            /* Elegant Empty State replacing blank space */
            <section
              className="h-full flex flex-col items-center justify-center text-center p-8 rounded-2xl border border-dashed border-ink/15 dark:border-white/15 bg-linear-to-b from-surface/50 to-surface-muted/20"
              aria-label="No pending invitations"
            >
              <div className="relative flex items-center justify-center size-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 mb-5 shadow-xs">
                <span className="absolute inset-0 rounded-full bg-emerald-500/10 animate-pulse" />
                <svg className="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                </svg>
              </div>

              <h2 className="font-serif text-lg font-bold text-ink">
                {locale === "ar" ? "كل شيء جاهز!" : "All Caught Up!"}
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-ink/60 max-w-xs">
                {locale === "ar"
                  ? "لا توجد دعوات مراجعة أقران أو دعوات انضمام لطاقم العمل معلقة بانتظار ردك حالياً."
                  : "No pending review invitations or staff role invitations at the moment. We will notify you when a new invitation arrives."}
              </p>
              
              <div className="h-px w-24 bg-ink/[0.08] dark:bg-white/[0.08] my-4" aria-hidden />
              
              <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/8 border border-emerald-500/15 rounded-full px-3 py-1">
                {locale === "ar" ? "حسابك محدث ومكتمل" : "Your inbox is clear"}
              </p>
            </section>
          )}

        </div>

      </div>
    </main>
  );
}
