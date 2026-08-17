'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { ShieldCheck, Bell, LogOut, Plus, Search } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { useMe } from '@/lib/queries/auth';
import { visibleNavItems } from '@/components/nav-items';
import { canBrowseAuthorSubmissionsNav } from '@/lib/permissions';
import { apiJson } from '@/lib/api';
import { clearCsrfToken } from '@/lib/csrf-token';
import { broadcastAuthLogout } from '@/components/auth-storage-sync';
import { useQueryClient } from '@tanstack/react-query';

export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return { open, setOpen };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CommandPalette({ open, onOpenChange }: Props) {
  const t = useTranslations('Nav');
  const tc = useTranslations('CommandPalette');
  const router = useRouter();
  const queryClient = useQueryClient();
  const meQuery = useMe();
  const me = meQuery.data;
  const perms = new Set(me?.permissions ?? []);

  const run = useCallback(
    (action: () => void) => {
      onOpenChange(false);
      setTimeout(action, 80);
    },
    [onOpenChange],
  );

  async function handleLogout() {
    onOpenChange(false);
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

  /** Shared with the header and drawer — see `nav-items.ts`. */
  const navItems = visibleNavItems({ signedIn: !!me, perms });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t('commandPaletteTitle')}
        className="overflow-hidden p-0 shadow-2xl max-w-xl"
        aria-describedby={undefined}
      >
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink/40 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3">
          <CommandInput placeholder={tc('placeholder')} />
          <CommandList>
            <CommandEmpty>
              <span className="flex flex-col items-center gap-2 py-2">
                <Search className="h-8 w-8 text-ink/20" />
                {tc('noResults')}
              </span>
            </CommandEmpty>

            {navItems.length > 0 && (
              <CommandGroup heading={tc('groupNavigate')}>
                {navItems.map((item) => (
                  <CommandItem
                    key={item.href}
                    value={t(item.labelKey)}
                    onSelect={() => run(() => router.push(item.href))}
                  >
                    <item.icon className="h-4 w-4 text-ink/50 shrink-0" />
                    <span>{t(item.labelKey)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {!!me && canBrowseAuthorSubmissionsNav(perms) && (
              <>
                <CommandSeparator />
                <CommandGroup heading={tc('groupActions')}>
                  {/* `value` also carries English keywords so the palette stays searchable in either language. */}
                  <CommandItem
                    value={`${tc('newSubmission')} new submission create draft`}
                    onSelect={() => run(() => router.push('/submissions/new'))}
                  >
                    <Plus className="h-4 w-4 text-accent shrink-0" />
                    <span>{tc('newSubmission')}</span>
                    <CommandShortcut>{tc('newBadge')}</CommandShortcut>
                  </CommandItem>
                </CommandGroup>
              </>
            )}

            {!!me && (
              <>
                <CommandSeparator />
                <CommandGroup heading={tc('groupAccount')}>
                  <CommandItem
                    value={`${tc('notifications')} notifications bell alerts`}
                    onSelect={() => run(() => router.push('/notifications'))}
                  >
                    <Bell className="h-4 w-4 text-ink/50 shrink-0" />
                    <span>{tc('notifications')}</span>
                  </CommandItem>
                  <CommandItem
                    value={`${tc('signOut')} logout sign out`}
                    onSelect={() => void handleLogout()}
                    className="data-[selected=true]:text-danger data-[selected=true]:bg-danger/8"
                  >
                    <LogOut className="h-4 w-4 text-ink/50 shrink-0 data-[selected=true]:text-danger" />
                    <span>{tc('signOut')}</span>
                    <CommandShortcut>⇧⌘Q</CommandShortcut>
                  </CommandItem>
                </CommandGroup>
              </>
            )}

            {!me && (
              <>
                <CommandSeparator />
                <CommandGroup heading={tc('groupAccount')}>
                  <CommandItem
                    value={`${tc('signIn')} login sign in`}
                    onSelect={() => run(() => router.push('/login'))}
                  >
                    <ShieldCheck className="h-4 w-4 text-ink/50 shrink-0" />
                    <span>{tc('signIn')}</span>
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
