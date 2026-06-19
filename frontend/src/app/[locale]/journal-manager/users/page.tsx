'use client';

import type React from 'react';
import { format } from 'date-fns';
import {
  Building2,
  CheckCircle2,
  Clock,
  Mail,
  Search,
  SlidersHorizontal,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { ApiErrorState } from '@/components/api-error-state';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { SimpleSelect } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Skeleton } from '@/components/ui/skeleton';
import {
  SkeletonBusyRegion,
  SkeletonLoadingStatus,
} from '@/components/ui/skeleton-loading-status';
import { useMe } from '@/lib/queries/auth';
import {
  createRoleInvitation,
  fetchAdminUsers,
  patchUserRoles,
} from '@/lib/queries/users-admin';
import { EMPTY_STATE_CLS } from '@/lib/page-shell';
import { PERMISSION_SLUGS, ROLE_SLUGS } from '@/lib/permissions';
import { submissionQueueShellCls } from '@/lib/submission-list-ui';
import { toast } from '@/lib/toast';
import { useApiErrorMessages } from '@/lib/use-api-error-messages';
import { useToastApiError } from '@/lib/use-toast-api-error';
import {
  createRoleInvitationSchema,
  safeParseResult,
  updateUserRolesSchema,
} from '@/lib/validation';
import type { AdminUserRow } from '@/lib/users-admin';
import { hasPendingInvite, hasRole, withRoleToggle } from '@/lib/users-admin';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

type RoleLabelKey =
  | 'roleAuthor'
  | 'roleEditor'
  | 'roleJournalManager'
  | 'roleReviewer'
  | 'roleCopyeditor';

function roleLabelKey(slug: string): RoleLabelKey | null {
  switch (slug) {
    case ROLE_SLUGS.AUTHOR:
      return 'roleAuthor';
    case ROLE_SLUGS.EDITOR:
      return 'roleEditor';
    case ROLE_SLUGS.JOURNAL_MANAGER:
      return 'roleJournalManager';
    case ROLE_SLUGS.REVIEWER:
      return 'roleReviewer';
    case ROLE_SLUGS.COPYEDITOR:
      return 'roleCopyeditor';
    default:
      return null;
  }
}

const ROLE_PILL_BASE =
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider border';

function rolePillClass(slug: string): string {
  switch (slug) {
    case ROLE_SLUGS.REVIEWER:
      return `${ROLE_PILL_BASE} bg-blue-500/8 border-blue-500/15 text-blue-600 dark:text-blue-400`;
    case ROLE_SLUGS.COPYEDITOR:
      return `${ROLE_PILL_BASE} bg-purple-500/8 border-purple-500/15 text-purple-600 dark:text-purple-400`;
    case ROLE_SLUGS.EDITOR:
      return `${ROLE_PILL_BASE} bg-amber-500/8 border-amber-500/15 text-amber-600 dark:text-amber-400`;
    case ROLE_SLUGS.JOURNAL_MANAGER:
      return `${ROLE_PILL_BASE} bg-rose-500/8 border-rose-500/15 text-rose-600 dark:text-rose-400`;
    default:
      return `${ROLE_PILL_BASE} bg-ink/5 border-ink/10 text-ink/60`;
  }
}

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
] as const;

function avatarColorClass(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffff;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0] ?? '').slice(0, 2).toUpperCase();
  return (
    (parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')
  ).toUpperCase();
}

function UserCardSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <li
      style={{ '--sk-delay': `${delay}ms` } as React.CSSProperties}
      className="rounded-2xl border border-ink/10 bg-surface p-5 shadow-xs"
    >
      <div className="flex gap-4">
        <Skeleton className="size-11 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-44 rounded-lg" />
          <Skeleton className="h-3.5 w-60 rounded-lg" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        </div>
      </div>
      <div className="mt-5 grid gap-4 border-t border-ink/8 pt-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-13 rounded-xl" />
          <Skeleton className="h-13 rounded-xl" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-9 rounded-xl" />
          <Skeleton className="h-9 rounded-xl" />
        </div>
      </div>
    </li>
  );
}

function JournalManagerPageSkeleton() {
  const t = useTranslations('JournalManagerUsers');
  return (
    <main className={submissionQueueShellCls} aria-busy="true">
      <SkeletonLoadingStatus label={t('loading')} />
      <header className="border-s-4 border-s-accent/35 ps-5 space-y-2">
        <Skeleton className="h-9 w-48 rounded-xl" />
        <Skeleton className="h-4 w-72" />
      </header>
      <div className="mt-6 space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-10 w-full max-w-md rounded-xl" />
      </div>
      <ul className="mt-6 space-y-4" aria-hidden>
        {[0, 1, 2].map((i) => (
          <UserCardSkeleton key={i} delay={i * 75} />
        ))}
      </ul>
    </main>
  );
}

export default function JournalManagerUsersPage() {
  const t = useTranslations('JournalManagerUsers');
  const me = useMe();
  const { resolve: resolveApiError } = useApiErrorMessages();
  const showApiError = useToastApiError();

  const [searchInput, setSearchInput] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCause, setErrorCause] = useState<unknown>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  // Advanced search draft state (what the user is building)
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [roleDraft, setRoleDraft] = useState('');
  const [joinedFromDraft, setJoinedFromDraft] = useState<Date | undefined>(
    undefined,
  );
  const [joinedToDraft, setJoinedToDraft] = useState<Date | undefined>(
    undefined,
  );

  // Applied state (what drives the actual query)
  const [appliedRole, setAppliedRole] = useState('');
  const [appliedJoinedFrom, setAppliedJoinedFrom] = useState('');
  const [appliedJoinedTo, setAppliedJoinedTo] = useState('');

  const activeFilterCount = [
    appliedRole,
    appliedJoinedFrom,
    appliedJoinedTo,
  ].filter(Boolean).length;

  const canAccess = me.data?.permissions.includes(
    PERMISSION_SLUGS.USERS_MANAGE_ROLES,
  );

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedQ(searchInput.trim());
      setOffset(0);
    }, 300);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const load = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    setError(null);
    setErrorCause(null);
    try {
      const data = await fetchAdminUsers({
        q: debouncedQ || undefined,
        role: appliedRole || undefined,
        joinedFrom: appliedJoinedFrom || undefined,
        joinedTo: appliedJoinedTo || undefined,
        limit: PAGE_SIZE,
        offset,
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setErrorCause(err);
      setError(resolveApiError(err, t('loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [
    canAccess,
    debouncedQ,
    appliedRole,
    appliedJoinedFrom,
    appliedJoinedTo,
    offset,
    resolveApiError,
    t,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyAdvanced() {
    setAppliedRole(roleDraft);
    setAppliedJoinedFrom(
      joinedFromDraft ? format(joinedFromDraft, 'yyyy-MM-dd') : '',
    );
    setAppliedJoinedTo(
      joinedToDraft ? format(joinedToDraft, 'yyyy-MM-dd') : '',
    );
    setOffset(0);
    setAdvancedOpen(false);
  }

  function clearAllFilters() {
    setSearchInput('');
    setDebouncedQ('');
    setRoleDraft('');
    setJoinedFromDraft(undefined);
    setJoinedToDraft(undefined);
    setAppliedRole('');
    setAppliedJoinedFrom('');
    setAppliedJoinedTo('');
    setOffset(0);
    setAdvancedOpen(false);
  }

  async function toggleDirectRole(
    row: AdminUserRow,
    roleSlug: string,
    on: boolean,
  ) {
    const next = withRoleToggle(row.roleSlugs, roleSlug, on);
    const parsed = safeParseResult(updateUserRolesSchema, { roleSlugs: next });
    if (!parsed.ok) return;

    setRowBusy(row.id);
    try {
      await patchUserRoles(row.id, parsed.data.roleSlugs);
      setItems((prev) =>
        prev.map((u) =>
          u.id === row.id ? { ...u, roleSlugs: parsed.data.roleSlugs } : u,
        ),
      );
      toast.success(t('rolesSaved'));
    } catch (err) {
      showApiError(err, t('loadFailed'));
    } finally {
      setRowBusy(null);
    }
  }

  async function sendInvite(
    row: AdminUserRow,
    roleSlug: 'editor' | 'journal_manager',
  ) {
    const parsed = safeParseResult(createRoleInvitationSchema, { roleSlug });
    if (!parsed.ok) return;

    setRowBusy(row.id);
    try {
      await createRoleInvitation(row.id, parsed.data.roleSlug);
      setItems((prev) =>
        prev.map((u) => {
          if (u.id !== row.id) return u;
          if (hasPendingInvite(u, roleSlug)) return u;
          return {
            ...u,
            pendingRoleInvitations: [
              ...u.pendingRoleInvitations,
              { id: `pending-${roleSlug}`, roleSlug },
            ],
          };
        }),
      );
      toast.success(t('inviteSent'));
      void load();
    } catch (err) {
      showApiError(err, t('loadFailed'));
    } finally {
      setRowBusy(null);
    }
  }

  if (me.isPending) {
    return <JournalManagerPageSkeleton />;
  }

  if (!canAccess) {
    return (
      <main className={submissionQueueShellCls}>
        <div className={cn(EMPTY_STATE_CLS, 'mt-8')}>
          <div className="flex size-12 items-center justify-center rounded-full bg-ink/6">
            <Users className="size-6 text-ink/40" aria-hidden />
          </div>
          <p className="text-sm text-ink/70">{t('forbidden')}</p>
        </div>
      </main>
    );
  }

  if (error && items.length === 0 && !loading) {
    return (
      <main className={submissionQueueShellCls}>
        <ApiErrorState
          message={error}
          error={errorCause}
          onRetry={() => void load()}
          retryLabel={t('retryLoad')}
        />
      </main>
    );
  }

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const pageEnd = Math.min(offset + items.length, total);
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

  const roleOptions = [
    { value: '', label: t('filterRoleAny') },
    { value: ROLE_SLUGS.AUTHOR, label: t('roleAuthor') },
    { value: ROLE_SLUGS.REVIEWER, label: t('roleReviewer') },
    { value: ROLE_SLUGS.COPYEDITOR, label: t('roleCopyeditor') },
    { value: ROLE_SLUGS.EDITOR, label: t('roleEditor') },
    { value: ROLE_SLUGS.JOURNAL_MANAGER, label: t('roleJournalManager') },
  ];

  return (
    <main className={submissionQueueShellCls}>
      {/* Page header */}
      <header className="border-s-4 border-s-accent/35 ps-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              {t('title')}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink/70">
              {t('hint')}
            </p>
          </div>
          {!loading && total > 0 ? (
            <div className="hidden shrink-0 rounded-xl border border-ink/10 bg-surface px-4 py-3 text-center shadow-xs sm:block">
              <p className="text-2xl font-bold tabular-nums text-ink">
                {total}
              </p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink/45">
                {t('totalUsers')}
              </p>
            </div>
          ) : null}
        </div>
      </header>

      {/* Search bar + Advanced toggle */}
      <div className="mt-6">
        <label
          htmlFor="user-admin-search"
          className="text-xs font-semibold uppercase tracking-wider text-ink/50"
        >
          {t('searchLabel')}
        </label>
        <div className="mt-2 flex gap-2">
          <div className="relative flex-1 max-w-md">
            <Search
              className="pointer-events-none absolute inset-s-3 top-1/2 size-4 -translate-y-1/2 text-ink/40"
              aria-hidden
            />
            <input
              id="user-admin-search"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full rounded-xl border border-ink/15 bg-surface py-2.5 pe-9 ps-9 text-sm text-ink shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
              autoComplete="off"
            />
            {searchInput ? (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="absolute inset-e-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-ink/40 transition hover:text-ink/70"
                aria-label="Clear search"
              >
                <X className="size-4" aria-hidden />
              </button>
            ) : null}
          </div>

          {/* Advanced toggle */}
          <button
            type="button"
            onClick={() => setAdvancedOpen((o) => !o)}
            aria-expanded={advancedOpen}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition-all duration-200',
              advancedOpen
                ? 'border-accent/30 bg-accent/8 text-accent'
                : 'border-ink/15 bg-surface text-ink/70 hover:border-ink/25 hover:text-ink',
            )}
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            <span className="hidden sm:inline">{t('advancedSearch')}</span>
            {activeFilterCount > 0 ? (
              <span className="flex size-4.5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {/* Advanced filters panel */}
      {advancedOpen ? (
        <div className="mt-3 rounded-2xl border border-ink/10 bg-surface/95 p-4 shadow-sm backdrop-blur-md">
          <div className="grid gap-4 sm:grid-cols-3">
            {/* Role */}
            <div>
              <label
                htmlFor="user-adv-role"
                className="block text-[11px] font-bold uppercase tracking-wider text-ink/45"
              >
                {t('filterRole')}
              </label>
              <div className="mt-1.5">
                <SimpleSelect
                  value={roleDraft}
                  onValueChange={setRoleDraft}
                  options={roleOptions}
                  placeholder={t('filterRoleAny')}
                  aria-labelledby="user-adv-role"
                />
              </div>
            </div>

            {/* Joined from */}
            <div>
              <label
                htmlFor="user-adv-from"
                className="block text-[11px] font-bold uppercase tracking-wider text-ink/45"
              >
                {t('filterJoinedFrom')}
              </label>
              <div className="mt-1.5">
                <DatePicker
                  id="user-adv-from"
                  value={joinedFromDraft}
                  onChange={setJoinedFromDraft}
                  placeholder={t('filterPickDate')}
                  aria-label={t('filterJoinedFrom')}
                />
              </div>
            </div>

            {/* Joined to */}
            <div>
              <label
                htmlFor="user-adv-to"
                className="block text-[11px] font-bold uppercase tracking-wider text-ink/45"
              >
                {t('filterJoinedTo')}
              </label>
              <div className="mt-1.5">
                <DatePicker
                  id="user-adv-to"
                  value={joinedToDraft}
                  onChange={setJoinedToDraft}
                  placeholder={t('filterPickDate')}
                  aria-label={t('filterJoinedTo')}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-4 flex flex-wrap gap-2 border-t border-ink/6 pt-4">
            <button
              type="button"
              onClick={applyAdvanced}
              className="rounded-xl bg-accent px-5 py-2 text-xs font-semibold text-white shadow-xs transition-all duration-200 hover:brightness-105 active:scale-[0.98]"
            >
              {t('filterApply')}
            </button>
            <button
              type="button"
              onClick={clearAllFilters}
              className="rounded-xl border border-ink/15 px-5 py-2 text-xs font-semibold text-ink/75 transition-all duration-200 hover:bg-ink/5 active:scale-[0.98]"
            >
              {t('filterClear')}
            </button>
          </div>
        </div>
      ) : null}

      {/* Active filter chips (when panel is closed) */}
      {!advancedOpen && activeFilterCount > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {appliedRole ? (
            <span className="flex items-center gap-1 rounded-full border border-accent/20 bg-accent/8 px-2.5 py-0.5 text-[11px] font-semibold text-accent">
              {roleOptions.find((o) => o.value === appliedRole)?.label ??
                appliedRole}
              <button
                type="button"
                onClick={() => {
                  setRoleDraft('');
                  setAppliedRole('');
                  setOffset(0);
                }}
                className="rounded-full p-0.5 hover:bg-accent/15"
                aria-label="Remove role filter"
              >
                <X className="size-2.5" />
              </button>
            </span>
          ) : null}
          {appliedJoinedFrom ? (
            <span className="flex items-center gap-1 rounded-full border border-accent/20 bg-accent/8 px-2.5 py-0.5 text-[11px] font-semibold text-accent">
              {t('filterJoinedFrom')}: {appliedJoinedFrom}
              <button
                type="button"
                onClick={() => {
                  setJoinedFromDraft(undefined);
                  setAppliedJoinedFrom('');
                  setOffset(0);
                }}
                className="rounded-full p-0.5 hover:bg-accent/15"
                aria-label="Remove joined-from filter"
              >
                <X className="size-2.5" />
              </button>
            </span>
          ) : null}
          {appliedJoinedTo ? (
            <span className="flex items-center gap-1 rounded-full border border-accent/20 bg-accent/8 px-2.5 py-0.5 text-[11px] font-semibold text-accent">
              {t('filterJoinedTo')}: {appliedJoinedTo}
              <button
                type="button"
                onClick={() => {
                  setJoinedToDraft(undefined);
                  setAppliedJoinedTo('');
                  setOffset(0);
                }}
                className="rounded-full p-0.5 hover:bg-accent/15"
                aria-label="Remove joined-to filter"
              >
                <X className="size-2.5" />
              </button>
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Content */}
      {loading && items.length === 0 ? (
        <SkeletonBusyRegion label={t('loading')} className="mt-6">
          <ul className="space-y-4">
            {[0, 1, 2].map((i) => (
              <UserCardSkeleton key={i} delay={i * 75} />
            ))}
          </ul>
        </SkeletonBusyRegion>
      ) : items.length === 0 ? (
        <div className={cn(EMPTY_STATE_CLS, 'mt-8')}>
          <div className="flex size-12 items-center justify-center rounded-full bg-ink/6">
            <Users className="size-6 text-ink/40" aria-hidden />
          </div>
          <div>
            <p className="font-serif text-base font-semibold text-ink">
              {t('empty')}
            </p>
            <p className="mt-1 text-sm text-ink/60">{t('emptyHint')}</p>
          </div>
        </div>
      ) : (
        <>
          {/* Results summary */}
          <div className="mt-5 flex items-center justify-between gap-4">
            <p className="flex items-center gap-2 text-xs text-ink/55">
              {t('showingCount', { count: pageEnd, total })}
              {loading ? <Spinner size="sm" aria-hidden /> : null}
            </p>
            {totalPages > 1 ? (
              <p className="text-xs text-ink/45">
                {currentPage} / {totalPages}
              </p>
            ) : null}
          </div>

          {/* User cards */}
          <ul className="mt-3 space-y-4">
            {items.map((row) => {
              const busy = rowBusy === row.id;
              const editorHas = hasRole(row, ROLE_SLUGS.EDITOR);
              const jmHas = hasRole(row, ROLE_SLUGS.JOURNAL_MANAGER);
              const editorPending = hasPendingInvite(row, ROLE_SLUGS.EDITOR);
              const jmPending = hasPendingInvite(
                row,
                ROLE_SLUGS.JOURNAL_MANAGER,
              );
              const initials = getInitials(row.displayName);
              const avatarColor = avatarColorClass(row.displayName);

              return (
                <li
                  key={row.id}
                  className={cn(
                    'rounded-2xl border border-ink/10 bg-surface shadow-xs transition-all duration-200 hover:shadow-sm',
                    busy && 'opacity-75',
                  )}
                >
                  {/* User identity */}
                  <div className="flex gap-4 p-5">
                    <Avatar className="size-11 shrink-0">
                      <AvatarFallback
                        className={cn('text-sm font-bold', avatarColor)}
                      >
                        {initials}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-serif text-base font-semibold leading-tight text-ink">
                          {row.displayName}
                        </p>
                        {busy ? <Spinner size="sm" /> : null}
                      </div>

                      <p className="mt-1 flex items-center gap-1.5 text-xs text-ink/55">
                        <Mail className="size-3 shrink-0" aria-hidden />
                        <span className="break-all">{row.email}</span>
                      </p>

                      {row.affiliation ? (
                        <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-ink/50">
                          <Building2 className="size-3 shrink-0" aria-hidden />
                          {row.affiliation}
                        </p>
                      ) : null}

                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {row.willingToReview ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/8 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="size-3" aria-hidden />
                            {t('willingToReview')}
                          </span>
                        ) : null}
                        {row.roleSlugs.map((slug) => {
                          const key = roleLabelKey(slug);
                          return (
                            <span key={slug} className={rolePillClass(slug)}>
                              {key ? t(key) : slug}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Role management */}
                  <div className="grid gap-5 border-t border-ink/8 px-5 pb-5 pt-4 sm:grid-cols-2">
                    {/* Direct roles (toggle immediately) */}
                    <div>
                      <p className="mb-2.5 text-[10px] font-bold uppercase tracking-wider text-ink/40">
                        {t('directRolesHeading')}
                      </p>
                      <div className="space-y-2">
                        <Checkbox
                          label={t('toggleReviewer')}
                          checked={hasRole(row, ROLE_SLUGS.REVIEWER)}
                          onCheckedChange={(checked) =>
                            void toggleDirectRole(
                              row,
                              ROLE_SLUGS.REVIEWER,
                              checked,
                            )
                          }
                          disabled={busy}
                        />
                        <Checkbox
                          label={t('toggleCopyeditor')}
                          checked={hasRole(row, ROLE_SLUGS.COPYEDITOR)}
                          onCheckedChange={(checked) =>
                            void toggleDirectRole(
                              row,
                              ROLE_SLUGS.COPYEDITOR,
                              checked,
                            )
                          }
                          disabled={busy}
                        />
                      </div>
                    </div>

                    {/* Privileged roles (invitation required) */}
                    <div>
                      <p className="mb-2.5 text-[10px] font-bold uppercase tracking-wider text-ink/40">
                        {t('inviteHeading')}
                      </p>
                      <div className="space-y-2">
                        {editorPending ? (
                          <div className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                            <Clock className="size-3.5 shrink-0" aria-hidden />
                            {t('pendingEditorInvite')}
                          </div>
                        ) : editorHas ? (
                          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/8 px-3 py-2.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2
                              className="size-3.5 shrink-0"
                              aria-hidden
                            />
                            {t('hasEditorRole')}
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => void sendInvite(row, 'editor')}
                            className="w-full justify-start gap-2 border-amber-500/35 bg-amber-500/6 text-amber-700 hover:bg-amber-500/14 hover:border-amber-500/50 dark:text-amber-400 dark:border-amber-500/25"
                          >
                            <UserPlus
                              className="size-3.5 shrink-0"
                              aria-hidden
                            />
                            {t('inviteEditor')}
                          </Button>
                        )}

                        {jmPending ? (
                          <div className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                            <Clock className="size-3.5 shrink-0" aria-hidden />
                            {t('pendingJournalManagerInvite')}
                          </div>
                        ) : jmHas ? (
                          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/8 px-3 py-2.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2
                              className="size-3.5 shrink-0"
                              aria-hidden
                            />
                            {t('hasJournalManagerRole')}
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              void sendInvite(row, 'journal_manager')
                            }
                            className="w-full justify-start gap-2 border-rose-500/35 bg-rose-500/6 text-rose-700 hover:bg-rose-500/14 hover:border-rose-500/50 dark:text-rose-400 dark:border-rose-500/25"
                          >
                            <UserPlus
                              className="size-3.5 shrink-0"
                              aria-hidden
                            />
                            {t('inviteJournalManager')}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Pagination */}
          <div className="mt-6 flex items-center justify-between gap-4">
            <Button
              variant="outline"
              size="sm"
              disabled={!canPrev || loading}
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            >
              {t('prevPage')}
            </Button>

            {totalPages > 1 && totalPages <= 7 ? (
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => {
                  const page = i + 1;
                  return (
                    <button
                      key={page}
                      type="button"
                      disabled={loading}
                      onClick={() => setOffset((page - 1) * PAGE_SIZE)}
                      className={cn(
                        'flex size-7 items-center justify-center rounded-lg text-xs font-medium transition',
                        page === currentPage
                          ? 'bg-accent text-white'
                          : 'text-ink/60 hover:bg-ink/6 hover:text-ink disabled:opacity-40',
                      )}
                    >
                      {page}
                    </button>
                  );
                })}
              </div>
            ) : null}

            <Button
              variant="outline"
              size="sm"
              disabled={!canNext || loading}
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
            >
              {t('nextPage')}
            </Button>
          </div>
        </>
      )}
    </main>
  );
}
