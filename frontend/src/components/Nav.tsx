'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Menu,
  X,
  LogOut,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { apiJson } from '@/lib/api';
import { broadcastAuthLogout } from '@/components/auth-storage-sync';
import { clearCsrfToken } from '@/lib/csrf-token';
import { useMe } from '@/lib/queries/auth';
import { NavSettingsMenu } from '@/components/nav-settings-menu';
import { NotificationBell } from '@/components/notification-bell';
import { isNavActive, visibleNavItems } from '@/components/nav-items';
import { useNavOverflow } from '@/components/use-nav-overflow';
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  CommandPalette,
  useCommandPalette,
} from '@/components/command-palette';
import { SimpleTooltip } from '@/components/ui/tooltip';

/** `shrink-0 whitespace-nowrap` keeps links at their natural width inside the non-wrapping row. */
const navLinkBase =
  'shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 focus-visible:ring-offset-surface';

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
  className,
  children,
}: {
  href: string;
  match: 'exact' | 'prefix';
  className?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = isNavActive(pathname, href, match);
  return (
    <Link
      href={href}
      className={cn(navLinkClass(active), className)}
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
  const signedIn = !!meQuery.data;
  const perms = new Set(meQuery.data?.permissions ?? []);
  const items = visibleNavItems({ signedIn, perms });

  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const { open: cmdOpen, setOpen: setCmdOpen } = useCommandPalette();

  const { containerRef, ghostRef, visibleCount } = useNavOverflow({
    itemCount: items.length,
    locale,
  });
  const visibleItems = items.slice(0, visibleCount);
  const overflowItems = items.slice(visibleCount);
  const overflowActive = overflowItems.some((item) =>
    isNavActive(pathname, item.href, item.match),
  );

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
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          {/*
            Brand. The inner container is capped at `max-w-6xl`, so desktop nav space does NOT
            grow with the viewport — the full title would cost ~175px (≈2 tabs) at every desktop
            width. Full title below `lg`, where the drawer owns navigation and space is free.
          */}
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
            <span className="lg:hidden">{t('brand')}</span>
            <span className="hidden lg:inline">{t('brandShort')}</span>
          </Link>

          {/*
            Desktop nav. `min-w-0` + `overflow-hidden` fix this region's width from the outside,
            so the measured item count can never feed back into the available width.
          */}
          <nav
            ref={containerRef}
            className="relative hidden min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-hidden lg:flex"
          >
            {visibleItems.map((item) => (
              <NavTextLink key={item.href} href={item.href} match={item.match}>
                {t(item.labelKey)}
              </NavTextLink>
            ))}

            {overflowItems.length > 0 && (
              <Popover open={overflowOpen} onOpenChange={setOverflowOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label={t('moreAria')}
                    className={cn(
                      navLinkClass(overflowActive),
                      'inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent',
                      overflowActive &&
                        'bg-accent/12 text-accent ring-1 ring-accent/25',
                    )}
                  >
                    {t('more')}
                    <ChevronDown className="size-3.5 opacity-60" aria-hidden />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56">
                  {overflowItems.map((item) => {
                    const active = isNavActive(pathname, item.href, item.match);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOverflowOpen(false)}
                        className={cn(
                          'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                          active
                            ? 'bg-accent/10 text-accent'
                            : 'text-ink/80 hover:bg-ink/5 hover:text-ink',
                        )}
                        aria-current={active ? 'page' : undefined}
                      >
                        <item.icon
                          className="size-4 shrink-0 opacity-60"
                          aria-hidden
                        />
                        {t(item.labelKey)}
                      </Link>
                    );
                  })}
                </PopoverContent>
              </Popover>
            )}

            {/*
              Ghost row: the full set at natural width, used only for measurement.
              `inert` + `aria-hidden` keep these clones out of the tab order and the a11y tree,
              so `getByRole` never sees two of every link.
            */}
            <div
              ref={ghostRef}
              aria-hidden
              inert
              className="invisible pointer-events-none absolute start-0 top-0 flex w-max flex-nowrap items-center gap-2"
            >
              {items.map((item) => (
                <span key={item.href} className={navLinkBase}>
                  {t(item.labelKey)}
                </span>
              ))}
              <span
                className={cn(navLinkBase, 'inline-flex items-center gap-1')}
              >
                {t('more')}
                <ChevronDown className="size-3.5" aria-hidden />
              </span>
            </div>
          </nav>

          {/* Right cluster — fixed width, shared by mobile and desktop */}
          <div className="ms-auto flex shrink-0 items-center gap-2">
            <SimpleTooltip content={t('commandPaletteTooltip')}>
              <button
                type="button"
                onClick={() => setCmdOpen(true)}
                className={cn(
                  navLinkBase,
                  'search-icon-container hidden items-center gap-2 border border-ink/10 text-ink/55 hover:bg-ink/6 hover:text-ink lg:inline-flex',
                )}
                aria-label={t('commandPaletteAria')}
              >
                {/*
                  Icon-only on every desktop width. The container is capped at `max-w-6xl`, so
                  the label + ⌘K hint would cost ~75px (a whole tab) at all widths without ever
                  buying back room. The tooltip (`commandPaletteTooltip`) still names the shortcut.
                */}
                <Search className="h-3.5 w-3.5" />
                <span className="sr-only">{t('searchLabel')}</span>
              </button>
            </SimpleTooltip>

            {signedIn && <NotificationBell />}
            <NavSettingsMenu />

            {signedIn ? (
              <>
                <div
                  className="mx-1 hidden h-4 w-px shrink-0 bg-ink/12 lg:block"
                  aria-hidden
                />
                <button
                  type="button"
                  onClick={() => setLogoutDialogOpen(true)}
                  className={cn(
                    navLinkBase,
                    'hidden cursor-pointer border-0 bg-transparent text-ink/60 hover:bg-ink/6 hover:text-ink lg:inline-flex',
                  )}
                >
                  {t('logout')}
                </button>
              </>
            ) : (
              <>
                <NavTextLink
                  href="/login"
                  match="exact"
                  className="hidden lg:inline-flex"
                >
                  {t('login')}
                </NavTextLink>
                <Link
                  href="/register"
                  className={cn(
                    navLinkBase,
                    'hidden shadow-sm lg:inline-flex',
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

            <button
              type="button"
              aria-label={t('openNavMenuAria')}
              onClick={() => setMobileDrawerOpen(true)}
              className={cn(
                navLinkBase,
                'p-2 text-ink/70 hover:bg-ink/6 hover:text-ink lg:hidden',
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
                aria-label={t('closeMenuAria')}
                className="rounded-md p-1.5 text-ink/50 hover:bg-ink/6"
              >
                <X className="h-5 w-5" />
              </button>
            </DrawerClose>
          </DrawerHeader>

          <nav
            className="px-4 pb-6 flex flex-col gap-1"
            aria-label={t('mobileNavAria')}
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
              {t('searchDrawerLabel')}
              <kbd className="ms-auto text-[10px] font-sans text-ink/30">
                ⌘K
              </kbd>
            </button>

            {/* Nav links — same shared list, so drawer and header can never drift apart */}
            {items.map((item) => {
              const active = isNavActive(pathname, item.href, item.match);
              return (
                <DrawerClose key={item.href} asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      'flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium transition-colors',
                      active
                        ? 'bg-accent/10 text-accent'
                        : 'text-ink/80 hover:bg-ink/5 hover:text-ink',
                    )}
                    aria-current={active ? 'page' : undefined}
                  >
                    {t(item.labelKey)}
                    <ChevronRight className="h-4 w-4 opacity-40 rtl:rotate-180" />
                  </Link>
                </DrawerClose>
              );
            })}

            {/* Auth actions */}
            <div className="mt-3 pt-3 border-t border-ink/[0.07] flex flex-col gap-1">
              {signedIn ? (
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
                      <ChevronRight className="h-4 w-4 opacity-40 rtl:rotate-180" />
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
