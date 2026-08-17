'use client';

import type React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@/i18n/navigation';
import { apiJson } from '@/lib/api';
import { ApiErrorState } from '@/components/api-error-state';
import { useMe } from '@/lib/queries/auth';
import { queryKeys } from '@/lib/query-keys';
import { toast } from '@/lib/toast';
import { useApiErrorMessages } from '@/lib/use-api-error-messages';
import { useToastApiError } from '@/lib/use-toast-api-error';
import type { MeProfile } from '@/lib/permissions';
import {
  canBrowseAuthorSubmissionsNav,
  PERMISSION_SLUGS,
  ROLE_SLUGS,
} from '@/lib/permissions';
import { PAGE_SHELL } from '@/lib/page-shell';
import { Spinner } from '@/components/ui/spinner';
import { Skeleton } from '@/components/ui/skeleton';
import {
  SkeletonBusyRegion,
  SkeletonLoadingStatus,
} from '@/components/ui/skeleton-loading-status';
import { Button } from '@/components/ui/button';
import { SimpleSelect } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  FileText,
  LayoutGrid,
  ClipboardList,
  Globe,
  Mail,
  Building2,
  ChevronRight,
  BadgeCheck,
} from 'lucide-react';
import { formatSubmissionUpdatedAt } from '@/lib/submission-list-ui';
import { ActiveSessionsCard } from '@/components/active-sessions-card';
import { OrcidAccountCard } from '@/components/orcid-account-card';

function RowChevron() {
  return (
    <ChevronRight
      className="size-4 shrink-0 text-ink/35 transition-all duration-300 group-hover:translate-x-1 group-hover:text-accent rtl:rotate-180 rtl:group-hover:-translate-x-1"
      aria-hidden
    />
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

function DashboardSkeleton() {
  const tCommon = useTranslations('Common');
  return (
    <main className={PAGE_SHELL} aria-busy="true">
      <SkeletonLoadingStatus label={tCommon('loading')} />
      <header className="flex flex-col md:flex-row md:items-center md:justify-between border-s-4 border-s-accent/70 ps-5 mb-8">
        <div className="space-y-2">
          <Skeleton className="h-9 w-52 rounded-xl" />
          <Skeleton className="h-4 w-72" />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-12 mb-8">
        {/* Profile card */}
        <div className="lg:col-span-5 rounded-2xl border border-ink/10 p-6 space-y-0">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
            <Skeleton className="size-20 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-20 rounded-full" />
              <Skeleton className="h-6 w-40 rounded-xl" />
              <Skeleton className="h-4 w-52" />
            </div>
          </div>
          <div className="mt-6 pt-5 border-t border-ink/[0.07] space-y-3">
            <Skeleton className="h-3 w-24" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="lg:col-span-7">
          <Skeleton className="h-3 w-28 mb-4" />
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                style={{ '--sk-delay': `${i * 75}ms` } as React.CSSProperties}
                className="rounded-2xl border border-ink/10 p-5 space-y-2.5"
              >
                <div className="flex justify-between">
                  <Skeleton className="size-9 rounded-xl" />
                  <Skeleton className="size-4 rounded" />
                </div>
                <Skeleton className="h-5 w-32 rounded-xl" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </main>
  );
}

export default function DashboardPage() {
  const t = useTranslations('Dashboard');
  const tCommon = useTranslations('Common');
  const tOrcid = useTranslations('Orcid');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const meQuery = useMe();
  const me = meQuery.data ?? null;
  const [reviewInvites, setReviewInvites] = useState<ReviewInviteRow[]>([]);
  const [roleInvites, setRoleInvites] = useState<RoleInviteRow[]>([]);
  const [invitesLoaded, setInvitesLoaded] = useState(false);
  const [roleBusyId, setRoleBusyId] = useState<string | null>(null);
  const [emailPref, setEmailPref] = useState<'' | 'en' | 'ar'>('');
  const [emailPrefBusy, setEmailPrefBusy] = useState(false);
  const { resolve: resolveApiError } = useApiErrorMessages();
  const tApi = useTranslations('ApiErrors');
  const showApiError = useToastApiError();

  useEffect(() => {
    if (!me) return;
    const p = me.preferredLocale;
    setEmailPref(p === 'en' || p === 'ar' ? p : '');
  }, [me]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('orcid') !== 'linked') return;
    toast.success(tOrcid('linkSuccess'), { id: 'orcid-linked' });
    params.delete('orcid');
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
    window.history.replaceState({}, '', next);
  }, [tOrcid]);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    setInvitesLoaded(false);
    const loads: Promise<void>[] = [];

    if (me.permissions.includes(PERMISSION_SLUGS.ASSIGNMENT_VIEW_OWN)) {
      loads.push(
        apiJson<ReviewInviteRow[]>('/assignments/me')
          .then((rows) => {
            if (!cancelled) {
              setReviewInvites(rows.filter((r) => r.status === 'invited'));
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
      apiJson<RoleInviteRow[]>('/users/me/role-invitations')
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
      await apiJson(`/role-invitations/${id}/accept`, { method: 'POST' });
      const [profile, roles] = await Promise.all([
        apiJson<MeProfile>('/auth/me'),
        apiJson<RoleInviteRow[]>('/users/me/role-invitations'),
      ]);
      queryClient.setQueryData(queryKeys.me, profile);
      setRoleInvites(roles);
      toast.success(t('roleInviteAccepted'));
    } catch (err) {
      showApiError(err, t('roleInviteAcceptFailed'), {
        id: 'dashboard-role-invite-accept',
      });
    } finally {
      setRoleBusyId(null);
    }
  }

  async function declineRoleInvite(id: string) {
    setRoleBusyId(id);
    try {
      await apiJson(`/role-invitations/${id}/decline`, { method: 'POST' });
      setRoleInvites(
        await apiJson<RoleInviteRow[]>('/users/me/role-invitations'),
      );
      toast.success(t('roleInviteDeclined'));
    } catch (err) {
      showApiError(err, t('roleInviteDeclineFailed'), {
        id: 'dashboard-role-invite-decline',
      });
    } finally {
      setRoleBusyId(null);
    }
  }

  async function saveEmailPref() {
    setEmailPrefBusy(true);
    try {
      await apiJson('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({
          preferredLocale: emailPref === '' ? null : emailPref,
        }),
      });
      const profile = await apiJson<MeProfile>('/auth/me');
      queryClient.setQueryData(queryKeys.me, profile);
      toast.success(t('emailLanguageSaved'));
    } catch (err) {
      showApiError(err, t('emailLanguageSaveFailed'), {
        id: 'dashboard-email-pref',
      });
    } finally {
      setEmailPrefBusy(false);
    }
  }

  if (meQuery.isError) {
    return (
      <ApiErrorState
        className={PAGE_SHELL}
        message={resolveApiError(meQuery.error, t('loadFailed'))}
        error={meQuery.error}
        onRetry={() => void meQuery.refetch()}
        retryLabel={tApi('retry')}
      />
    );
  }

  if (!me) {
    return <DashboardSkeleton />;
  }

  const canEditorQueue = me.permissions.includes(
    PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
  );
  const canAssignments = me.permissions.includes(
    PERMISSION_SLUGS.ASSIGNMENT_VIEW_OWN,
  );

  const initial = me.displayName?.trim()?.charAt(0)?.toLocaleUpperCase() ?? '?';

  const links = [
    ...(canBrowseAuthorSubmissionsNav(me.permissions)
      ? [{ href: '/submissions', label: t('mySubmissions') } as const]
      : []),
    ...(canEditorQueue
      ? [{ href: '/editor', label: t('editorQueue') } as const]
      : []),
    ...(canAssignments
      ? [{ href: '/assignments', label: t('myReviewAssignments') } as const]
      : []),
    { href: '/publications', label: t('publicCatalog') },
  ];

  const hasPendingInvites =
    invitesLoaded && (reviewInvites.length > 0 || roleInvites.length > 0);

  // Dynamic details and icons for descriptive cards
  const getLinkDetails = (href: string) => {
    switch (href) {
      case '/submissions':
        return {
          description: t('linkDescSubmissions'),
          colorClass:
            'from-indigo-500/10 to-indigo-500/5 dark:from-indigo-500/15 dark:to-indigo-500/5 text-indigo-600 dark:text-indigo-400 group-hover:border-indigo-500/35',
          glowClass: 'hover-glow-indigo',
          iconBg:
            'bg-indigo-500/12 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400',
          icon: <FileText className="size-5" />,
        };
      case '/editor':
        return {
          description: t('linkDescEditor'),
          colorClass:
            'from-accent/10 to-accent/5 dark:from-accent/15 dark:to-accent/5 text-accent group-hover:border-accent/35',
          glowClass: 'hover-glow-accent',
          iconBg: 'bg-accent/12 text-accent dark:bg-accent/20 dark:text-accent',
          icon: <LayoutGrid className="size-5" />,
        };
      case '/assignments':
        return {
          description: t('linkDescAssignments'),
          colorClass:
            'from-emerald-500/10 to-emerald-500/5 dark:from-emerald-500/15 dark:to-emerald-500/5 text-emerald-600 dark:text-emerald-400 group-hover:border-emerald-500/35',
          glowClass: 'hover-glow-emerald',
          iconBg:
            'bg-emerald-500/12 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400',
          icon: <ClipboardList className="size-5" />,
        };
      default:
        return {
          description: t('linkDescPublications'),
          colorClass:
            'from-amber-500/10 to-amber-500/5 dark:from-amber-500/15 dark:to-amber-500/5 text-amber-600 dark:text-amber-400 group-hover:border-amber-500/35',
          glowClass: 'hover-glow-amber',
          iconBg:
            'bg-amber-500/12 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400',
          icon: <Globe className="size-5" />,
        };
    }
  };

  // Safe localized role pills
  const getRoleLabel = (role: string) => {
    switch (role) {
      case ROLE_SLUGS.AUTHOR:
        return {
          label: t('roleAuthor'),
          classes:
            'bg-indigo-50 border-indigo-200/60 text-indigo-700 dark:bg-indigo-500/10 dark:border-indigo-500/20 dark:text-indigo-400',
        };
      case ROLE_SLUGS.REVIEWER:
        return {
          label: t('roleReviewer'),
          classes:
            'bg-emerald-50 border-emerald-200/60 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400',
        };
      case ROLE_SLUGS.EDITOR:
        return {
          label: t('roleEditor'),
          classes:
            'bg-orange-50 border-orange-200/60 text-orange-700 dark:bg-orange-500/10 dark:border-orange-500/20 dark:text-orange-400',
        };
      case ROLE_SLUGS.JOURNAL_MANAGER:
        return {
          label: t('roleJournalManager'),
          classes:
            'bg-amber-50 border-amber-200/60 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400',
        };
      case ROLE_SLUGS.COPYEDITOR:
        return {
          label: t('roleCopyeditor'),
          classes:
            'bg-sky-50 border-sky-200/60 text-sky-700 dark:bg-sky-500/10 dark:border-sky-500/20 dark:text-sky-400',
        };
      default:
        return {
          label: role,
          classes:
            'bg-ink/5 border-ink/10 text-ink/75 dark:bg-white/5 dark:border-white/10 dark:text-white/70',
        };
    }
  };

  return (
    <main className={PAGE_SHELL}>
      {/* Dynamic Header */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between border-s-4 border-s-accent/70 ps-5 mb-8">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            {t('title')}
          </h1>
          <p className="mt-1.5 text-sm text-ink/65">{t('welcomeSubtitle')}</p>
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
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.35] mix-blend-soft-light dark:opacity-20"
            aria-hidden
          >
            <div className="absolute -start-1/4 -top-1/3 h-[90%] w-[60%] rounded-full bg-[radial-gradient(closest-side,var(--accent),transparent_72%)]" />
            <div className="absolute -bottom-1/3 -end-1/4 h-[75%] w-[50%] rounded-full bg-[radial-gradient(closest-side,var(--accent-2),transparent_70%)]" />
          </div>

          <div className="relative flex flex-col sm:flex-row items-center sm:items-start gap-5">
            {/* Glowing Avatar Border Container */}
            <div className="flex size-20 shrink-0 items-center justify-center rounded-full bg-linear-to-tr from-accent to-accent-2 p-[2.5px] shadow-sm transform transition-all duration-500 group-hover:rotate-6">
              <Avatar className="h-full w-full">
                <AvatarImage src={undefined} alt={me.displayName ?? ''} />
                <AvatarFallback className="rounded-full bg-surface dark:bg-surface-muted text-3xl font-semibold text-accent">
                  {initial}
                </AvatarFallback>
              </Avatar>
            </div>

            <div className="min-w-0 flex-1 text-center sm:text-start">
              <span className="inline-flex rounded-full bg-accent/8 dark:bg-accent/18 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                {t('signedInAs')}
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
              {t('activeRolesHeading')}
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
                  {t('noActiveRoles')}
                </span>
              )}

              {/* Review status badge indicator */}
              {me.willingToReview && (
                <span className="inline-flex items-center rounded-full border border-emerald-500/25 bg-emerald-500/8 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="relative mr-1.5 rtl:ml-1.5 rtl:mr-0 flex size-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full size-2 bg-emerald-500"></span>
                  </span>
                  {t('willingToReview')}
                </span>
              )}
            </div>
          </div>

          {/* Affiliation & ORCID slots */}
          {(me.affiliation || me.orcid) && (
            <div className="relative mt-4 space-y-2 text-xs text-ink/60 bg-ink/[0.02] dark:bg-white/[0.02] rounded-xl p-3 border border-ink/[0.04] dark:border-white/[0.04]">
              {me.affiliation && (
                <div className="flex items-start gap-2">
                  <Building2 className="size-4 shrink-0 mt-0.5 text-accent-2 opacity-75" />
                  <span className="font-medium truncate" title={me.affiliation}>
                    {me.affiliation}
                  </span>
                </div>
              )}
              {me.orcid && (
                <div className="flex items-center gap-2">
                  <span className="shrink-0 size-4 flex items-center justify-center rounded-full bg-[#A6C307] text-[8px] font-bold text-white tracking-tighter">
                    iD
                  </span>
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
              {t('quickAccessHeading')}
            </h2>
            <nav aria-label={t('title')}>
              <motion.ul
                className="grid gap-4 sm:grid-cols-2"
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: {},
                  visible: {
                    transition: { staggerChildren: 0.07, delayChildren: 0.1 },
                  },
                }}
              >
                {links.map(({ href, label }) => {
                  const details = getLinkDetails(href);
                  return (
                    <motion.li
                      key={href}
                      variants={{
                        hidden: { opacity: 0, y: 16 },
                        visible: {
                          opacity: 1,
                          y: 0,
                          transition: {
                            type: 'spring',
                            stiffness: 260,
                            damping: 22,
                          },
                        },
                      }}
                    >
                      <Link
                        href={href}
                        className={`group relative flex flex-col h-full rounded-2xl border border-ink/10 dark:border-white/10 bg-gradient-to-br ${details.colorClass} ${details.glowClass} p-5 text-start shadow-xs transition-all duration-300 hover:-translate-y-1`}
                      >
                        <div className="flex items-center justify-between gap-4 mb-2.5">
                          <div
                            className={`flex size-9 items-center justify-center rounded-xl transition-all duration-300 ${details.iconBg} group-hover:scale-110`}
                          >
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
                    </motion.li>
                  );
                })}
              </motion.ul>
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
              <div
                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/8 text-accent"
                aria-hidden
              >
                <Mail className="size-4" />
              </div>
              <h2
                id="email-pref-heading"
                className="font-sans text-sm font-semibold text-ink"
              >
                {t('emailLanguageTitle')}
              </h2>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink/65">
              {t('emailLanguageHint')}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[140px]">
                <SimpleSelect
                  value={emailPref}
                  onValueChange={(val) => setEmailPref(val as '' | 'en' | 'ar')}
                  placeholder={t('emailLanguageAuto')}
                  options={[
                    { value: '', label: t('emailLanguageAuto') },
                    { value: 'en', label: t('emailLanguageEn') },
                    { value: 'ar', label: t('emailLanguageAr') },
                  ]}
                />
              </div>

              {/* Dynamic badge indicating currently active setting */}
              <div className="text-xs font-semibold px-2.5 py-2 rounded-lg bg-surface-muted border border-ink/[0.04]">
                {emailPref === 'en'
                  ? '🇺🇸 English'
                  : emailPref === 'ar'
                    ? '🇸🇾 العربية'
                    : '⚙️ Auto'}
              </div>

              <Button
                type="button"
                loading={emailPrefBusy}
                aria-label={
                  emailPrefBusy ? t('emailLanguageSaving') : undefined
                }
                onClick={() => void saveEmailPref()}
              >
                {t('emailLanguageSave')}
              </Button>
            </div>
          </section>

          <ActiveSessionsCard />

          {me && <OrcidAccountCard me={me} />}

          {/* Guidelines Tips box to cover white space beautifully */}
          <section
            className="rounded-2xl border border-ink/10 dark:border-white/10 bg-linear-to-b from-surface to-surface-muted/30 p-6 shadow-sm"
            aria-labelledby="tips-heading"
          >
            <h2
              id="tips-heading"
              className="font-serif text-base font-semibold text-ink flex items-center gap-2"
            >
              <span className="text-accent" aria-hidden>
                💡
              </span>
              {t('workspaceTipsHeading')}
            </h2>
            <div
              className="h-px bg-linear-to-r from-accent/30 via-accent-2/15 to-transparent mt-3 mb-4"
              aria-hidden
            />

            <ul className="space-y-3.5 text-xs text-ink/75 leading-relaxed">
              <li className="flex gap-2.5 items-start">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold">
                  1
                </span>
                <div>
                  <strong className="text-ink">
                    {t('tipConstructorTitle')}
                  </strong>{' '}
                  {t('tipConstructorBody')}
                </div>
              </li>
              <li className="flex gap-2.5 items-start">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                  2
                </span>
                <div>
                  <strong className="text-ink">{t('tipReviewTitle')}</strong>{' '}
                  {t('tipReviewBody')}
                </div>
              </li>
              <li className="flex gap-2.5 items-start">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent font-bold">
                  3
                </span>
                <div>
                  <strong className="text-ink">{t('tipFilesTitle')}</strong>{' '}
                  {t('tipFilesBody')}
                </div>
              </li>
            </ul>
          </section>
        </div>

        {/* Right Column: Pending invitations OR visual Empty State (no blank space!) */}
        <div>
          {!invitesLoaded ? (
            <SkeletonBusyRegion label={tCommon('loading')}>
              <Skeleton className="h-64 rounded-2xl" />
            </SkeletonBusyRegion>
          ) : hasPendingInvites ? (
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
                    {t('pendingInvitationsTitle')}
                  </h2>
                  {/* Glowing micro-animation dot */}
                  <span className="relative flex size-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                    <span className="relative inline-flex rounded-full size-2 bg-accent"></span>
                  </span>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                  {reviewInvites.length + roleInvites.length}
                </span>
              </div>

              <p className="text-xs text-ink/60 pb-4 border-b border-ink/[0.06] dark:border-white/[0.06]">
                {t('pendingInvitationsHint')}
              </p>

              {reviewInvites.length > 0 && (
                <div className="mt-5">
                  <h3 className="font-sans text-[10px] font-bold uppercase tracking-wider text-ink/40">
                    {t('subsectionReviewInvites')}
                  </h3>
                  <ul className="mt-3 space-y-3">
                    {reviewInvites.map((r) => {
                      const slug = r.slug?.trim();
                      const dateStr = r.assignedAt
                        ? formatSubmissionUpdatedAt(r.assignedAt, locale)
                        : '';
                      return (
                        <li
                          key={r.id}
                          className="group flex flex-col gap-4 rounded-xl border border-ink/10 dark:border-white/10 bg-surface-muted/50 p-4 transition-all duration-200 hover:border-accent/25 hover:bg-surface-muted/80 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p
                              className="font-serif text-base font-semibold text-ink group-hover:text-accent transition-colors duration-200 truncate"
                              title={r.submission?.title}
                            >
                              {r.submission?.title ?? t('untitledSubmission')}
                            </p>
                            {dateStr ? (
                              <p className="mt-1 text-[11px] text-ink/50 flex items-center gap-1">
                                <span className="text-accent-2">📅</span>
                                {t('invitedAt', { date: dateStr })}
                              </p>
                            ) : null}
                          </div>
                          {slug ? (
                            <Link
                              href={`/assignments/${encodeURIComponent(slug)}/invite`}
                              className="inline-flex shrink-0 items-center justify-center rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white shadow-xs hover:brightness-105 active:scale-[0.98] transition-all duration-200"
                            >
                              {t('respondToReviewInvite')}
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
                    {t('subsectionRoleInvites')}
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
                              {r.roleSlug === 'editor'
                                ? t('roleInviteEditorLine', {
                                    name: r.invitedBy.displayName,
                                  })
                                : r.roleSlug === 'journal_manager'
                                  ? t('roleInviteJournalManagerLine', {
                                      name: r.invitedBy.displayName,
                                    })
                                  : t('roleInviteGenericLine', {
                                      name: r.invitedBy.displayName,
                                      roleSlug: r.roleSlug,
                                    })}
                            </p>
                            <p className="mt-1 text-[11px] text-ink/50 flex items-center gap-1">
                              <span>📅</span>
                              {t('invitedAt', { date: dateStr })}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              loading={busy}
                              aria-label={busy ? t('working') : undefined}
                              onClick={() => void acceptRoleInvite(r.id)}
                            >
                              {t('acceptRole')}
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={busy}
                              onClick={() => void declineRoleInvite(r.id)}
                            >
                              {t('declineRole')}
                            </Button>
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
              aria-label={t('noPendingInvitationsAria')}
            >
              <div className="relative flex items-center justify-center size-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 mb-5 shadow-xs">
                <span className="absolute inset-0 rounded-full bg-emerald-500/10 animate-pulse" />
                <BadgeCheck className="size-8" strokeWidth={2} aria-hidden />
              </div>

              <h2 className="font-serif text-lg font-bold text-ink">
                {t('allCaughtUp')}
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-ink/60 max-w-xs">
                {locale === 'ar'
                  ? 'لا توجد دعوات مراجعة أقران أو دعوات انضمام لطاقم العمل معلقة بانتظار ردك حالياً.'
                  : 'No pending review invitations or staff role invitations at the moment. We will notify you when a new invitation arrives.'}
              </p>

              <div
                className="h-px w-24 bg-ink/[0.08] dark:bg-white/[0.08] my-4"
                aria-hidden
              />

              <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/8 border border-emerald-500/15 rounded-full px-3 py-1">
                {t('inboxClear')}
              </p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
