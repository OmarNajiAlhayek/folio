'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Search, Menu, X, LogOut, ChevronRight } from 'lucide-react';
import { apiJson } from '@/lib/api';
import { broadcastAuthLogout } from '@/components/auth-storage-sync';
import { clearCsrfToken } from '@/lib/csrf-token';
import { useMe } from '@/lib/queries/auth';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { NotificationBell } from '@/components/notification-bell';
import {
  canBrowseAuthorSubmissionsNav,
  PERMISSION_SLUGS,
} from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  CommandPalette,
  useCommandPalette,
} from '@/components/command-palette';
import { SimpleTooltip } from '@/components/ui/tooltip';

function isNavActive(
  pathname: string,
  href: string,
  match: 'exact' | 'prefix',
): boolean {
  const p = pathname === '' ? '/' : pathname;
  if (href === '/') {
    return p === '/';
  }
  if (match === 'exact') {
    return p === href;
  }
  return p === href || p.startsWith(`${href}/`);
}

const navLinkBase =
  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 focus-visible:ring-offset-surface';

function navLinkClass(active: boolean) {
  return cn(
    navLinkBase,
    active
      ? 'bg-accent/12 text-accent ring-1 ring-accent/25'
      : 'text-ink/75 hover:bg-ink/6 hover:text-ink',
  );
}

function NavTextLink({
  href,
  match,
  children,
}: {
  href: string;
  match: 'exact' | 'prefix';
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = isNavActive(pathname, href, match);
  return (
    <Link
      href={href}
      className={navLinkClass(active)}
      aria-current={active ? 'page' : undefined}
    >
      {children}
    </Link>
  );
}

export function Nav() {
  const t = useTranslations('Nav');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const meQuery = useMe();
  const perms = new Set(meQuery.data?.permissions ?? []);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const { open: cmdOpen, setOpen: setCmdOpen } = useCommandPalette();

  async function confirmLogout() {
    setLogoutDialogOpen(false);
    try {
      await apiJson('/auth/logout', { method: 'POST' });
    } catch {
      /* session may already be gone */
    }
    clearCsrfToken();
    broadcastAuthLogout();
    queryClient.clear();
    router.push('/login');
    router.refresh();
  }

  const homeActive = isNavActive(pathname, '/', 'exact');

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-ink/10 border-b-accent/25 bg-surface/85 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.12)] ring-1 ring-accent/10 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className={cn(
              navLinkBase,
              'font-serif text-xl font-semibold transition-colors',
              homeActive
                ? 'bg-accent/12 text-accent ring-1 ring-accent/25'
                : 'text-ink hover:bg-ink/6',
            )}
            aria-current={homeActive ? 'page' : undefined}
          >
            {t('brand')}
          </Link>

          {/* Desktop nav */}
          <nav className="hidden sm:flex flex-wrap items-center gap-1.5 sm:gap-2">
            <SimpleTooltip content={t('commandPaletteTooltip')}>
              <button
                type="button"
                onClick={() => setCmdOpen(true)}
                className={cn(
                  navLinkBase,
                  'inline-flex items-center gap-2 text-ink/55 hover:bg-ink/6 hover:text-ink border border-ink/10 px-3 py-1.5',
                )}
                aria-label={t('commandPaletteAria')}
              >
                <Search className="h-3.5 w-3.5" />
                <span className="text-xs">Search</span>
                <kbd className="ms-1 hidden text-[10px] font-sans font-medium text-ink/30 md:inline-flex items-center gap-0.5">
                  <span>⌘</span>
                  <span>K</span>
                </kbd>
              </button>
            </SimpleTooltip>
            <ThemeToggle />
            <LocaleSwitcher />
            <div className="mx-1 h-4 w-px shrink-0 bg-ink/12" aria-hidden />
            <NavTextLink href="/publications" match="prefix">
              {t('publications')}
            </NavTextLink>
            {meQuery.isSuccess && meQuery.data ? (
              <>
                <NavTextLink href="/dashboard" match="exact">
                  {t('dashboard')}
                </NavTextLink>
                {canBrowseAuthorSubmissionsNav(perms) && (
                  <NavTextLink href="/submissions" match="prefix">
                    {t('submissions')}
                  </NavTextLink>
                )}
                {perms.has(PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE) && (
                  <NavTextLink href="/editor" match="exact">
                    {t('editor')}
                  </NavTextLink>
                )}
                {perms.has(PERMISSION_SLUGS.SUBMISSION_VIEW_SECTION_QUEUE) && (
                  <NavTextLink href="/section-editor" match="exact">
                    {t('sectionEditor')}
                  </NavTextLink>
                )}
                {perms.has(PERMISSION_SLUGS.USERS_MANAGE_ROLES) && (
                  <NavTextLink href="/journal-manager/users" match="prefix">
                    {t('users')}
                  </NavTextLink>
                )}
                {perms.has(PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS) && (
                  <NavTextLink
                    href="/journal-manager/email-settings"
                    match="prefix"
                  >
                    {t('emailSettings')}
                  </NavTextLink>
                )}
                {perms.has(PERMISSION_SLUGS.AUDIT_LOG_VIEW) && (
                  <NavTextLink href="/journal-manager/audit-log" match="prefix">
                    {t('auditLog')}
                  </NavTextLink>
                )}
                {perms.has(PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE) && (
                  <NavTextLink
                    href="/journal-manager/search-curation"
                    match="prefix"
                  >
                    {t('searchCuration')}
                  </NavTextLink>
                )}
                {perms.has(PERMISSION_SLUGS.ASSIGNMENT_VIEW_OWN) && (
                  <NavTextLink href="/assignments" match="prefix">
                    {t('myReviews')}
                  </NavTextLink>
                )}
                {perms.has(PERMISSION_SLUGS.COPYEDIT_VIEW_QUEUE) && (
                  <NavTextLink href="/copyedit-assignments" match="prefix">
                    {t('copyediting')}
                  </NavTextLink>
                )}
                <NotificationBell />
                <div className="mx-1 h-4 w-px shrink-0 bg-ink/12" aria-hidden />
                <button
                  type="button"
                  onClick={() => setLogoutDialogOpen(true)}
                  className={cn(
                    navLinkBase,
                    'cursor-pointer border-0 bg-transparent text-ink/60 hover:bg-ink/6 hover:text-ink',
                  )}
                >
                  {t('logout')}
                </button>
              </>
            ) : (
              <>
                <NavTextLink href="/login" match="exact">
                  {t('login')}
                </NavTextLink>
                <Link
                  href="/register"
                  className={cn(
                    navLinkBase,
                    'shadow-sm',
                    isNavActive(pathname, '/register', 'exact')
                      ? 'bg-accent text-white ring-2 ring-accent/40 ring-offset-2 ring-offset-surface'
                      : 'bg-accent text-white hover:opacity-95',
                  )}
                  aria-current={
                    isNavActive(pathname, '/register', 'exact')
                      ? 'page'
                      : undefined
                  }
                >
                  {t('register')}
                </Link>
              </>
            )}
          </nav>

          {/* Mobile controls */}
          <div className="flex sm:hidden items-center gap-2">
            {meQuery.data && <NotificationBell />}
            <ThemeToggle />
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setMobileDrawerOpen(true)}
              className={cn(
                navLinkBase,
                'p-2 text-ink/70 hover:bg-ink/6 hover:text-ink',
              )}
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile navigation drawer */}
      <Drawer open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
        <DrawerContent>
          <DrawerHeader className="flex items-center justify-between">
            <DrawerTitle>{t('brand')}</DrawerTitle>
            <DrawerClose asChild>
              <button
                type="button"
                aria-label="Close menu"
                className="rounded-md p-1.5 text-ink/50 hover:bg-ink/6"
              >
                <X className="h-5 w-5" />
              </button>
            </DrawerClose>
          </DrawerHeader>

          <nav
            className="px-4 pb-6 flex flex-col gap-1"
            aria-label="Mobile navigation"
          >
            {/* Search shortcut */}
            <button
              type="button"
              onClick={() => {
                setMobileDrawerOpen(false);
                setCmdOpen(true);
              }}
              className="flex items-center gap-3 rounded-xl border border-ink/10 bg-ink/2 px-4 py-3 text-sm font-medium text-ink/70 mb-3"
            >
              <Search className="h-4 w-4 text-ink/40" />
              Search pages & actions…
              <kbd className="ms-auto text-[10px] font-sans text-ink/30">
                ⌘K
              </kbd>
            </button>

            {/* Nav links */}
            {[
              {
                href: '/publications',
                label: t('publications'),
                show: true,
                match: 'prefix' as const,
              },
              {
                href: '/dashboard',
                label: t('dashboard'),
                show: !!meQuery.data,
                match: 'exact' as const,
              },
              {
                href: '/submissions',
                label: t('submissions'),
                show: !!meQuery.data && canBrowseAuthorSubmissionsNav(perms),
                match: 'prefix' as const,
              },
              {
                href: '/editor',
                label: t('editor'),
                show:
                  !!meQuery.data &&
                  perms.has(PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE),
                match: 'exact' as const,
              },
              {
                href: '/section-editor',
                label: t('sectionEditor'),
                show:
                  !!meQuery.data &&
                  perms.has(PERMISSION_SLUGS.SUBMISSION_VIEW_SECTION_QUEUE),
                match: 'exact' as const,
              },
              {
                href: '/assignments',
                label: t('myReviews'),
                show:
                  !!meQuery.data &&
                  perms.has(PERMISSION_SLUGS.ASSIGNMENT_VIEW_OWN),
                match: 'prefix' as const,
              },
              {
                href: '/copyedit-assignments',
                label: t('copyediting'),
                show:
                  !!meQuery.data &&
                  perms.has(PERMISSION_SLUGS.COPYEDIT_VIEW_QUEUE),
                match: 'prefix' as const,
              },
              {
                href: '/journal-manager/users',
                label: t('users'),
                show:
                  !!meQuery.data &&
                  perms.has(PERMISSION_SLUGS.USERS_MANAGE_ROLES),
                match: 'prefix' as const,
              },
              {
                href: '/journal-manager/email-settings',
                label: t('emailSettings'),
                show:
                  !!meQuery.data &&
                  perms.has(PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS),
                match: 'prefix' as const,
              },
              {
                href: '/journal-manager/audit-log',
                label: t('auditLog'),
                show:
                  !!meQuery.data && perms.has(PERMISSION_SLUGS.AUDIT_LOG_VIEW),
                match: 'prefix' as const,
              },
              {
                href: '/journal-manager/search-curation',
                label: t('searchCuration'),
                show:
                  !!meQuery.data &&
                  perms.has(PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE),
                match: 'prefix' as const,
              },
            ]
              .filter((l) => l.show)
              .map(({ href, label, match }) => {
                const active = isNavActive(pathname, href, match);
                return (
                  <DrawerClose key={href} asChild>
                    <Link
                      href={href as '/'}
                      className={cn(
                        'flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium transition-colors',
                        active
                          ? 'bg-accent/10 text-accent'
                          : 'text-ink/80 hover:bg-ink/5 hover:text-ink',
                      )}
                      aria-current={active ? 'page' : undefined}
                    >
                      {label}
                      <ChevronRight className="h-4 w-4 opacity-40" />
                    </Link>
                  </DrawerClose>
                );
              })}

            {/* Auth actions */}
            <div className="mt-3 pt-3 border-t border-ink/[0.07] flex flex-col gap-1">
              {meQuery.data ? (
                <button
                  type="button"
                  onClick={() => {
                    setMobileDrawerOpen(false);
                    setLogoutDialogOpen(true);
                  }}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-danger/80 hover:bg-danger/5 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  {t('logout')}
                </button>
              ) : (
                <>
                  <DrawerClose asChild>
                    <Link
                      href="/login"
                      className="flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium text-ink/80 hover:bg-ink/5"
                    >
                      {t('login')}{' '}
                      <ChevronRight className="h-4 w-4 opacity-40" />
                    </Link>
                  </DrawerClose>
                  <DrawerClose asChild>
                    <Link
                      href="/register"
                      className="flex items-center justify-center rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white hover:brightness-105"
                    >
                      {t('register')}
                    </Link>
                  </DrawerClose>
                </>
              )}
            </div>
          </nav>
        </DrawerContent>
      </Drawer>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />

      <Dialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('logoutConfirmTitle')}</DialogTitle>
            <DialogDescription>
              {t('logoutConfirmDescription')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setLogoutDialogOpen(false)}
            >
              {t('logoutCancel')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void confirmLogout()}
            >
              {t('logoutConfirmAction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
