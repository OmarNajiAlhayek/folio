'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
          <nav className="flex flex-wrap items-center gap-1.5 sm:gap-2">
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
        </div>
      </header>

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
