'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import {
  LayoutDashboard,
  FileText,
  Globe,
  ShieldCheck,
  Users,
  Mail,
  ScrollText,
  ClipboardList,
  Pencil,
  Bell,
  LogOut,
  Plus,
  Search,
  BookOpen,
  SlidersHorizontal,
} from 'lucide-react';
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
import {
  PERMISSION_SLUGS,
  canBrowseAuthorSubmissionsNav,
} from '@/lib/permissions';
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

  const navItems = [
    {
      label: t('dashboard'),
      icon: LayoutDashboard,
      href: '/dashboard' as const,
      show: !!me,
    },
    {
      label: t('submissions'),
      icon: FileText,
      href: '/submissions' as const,
      show: !!me && canBrowseAuthorSubmissionsNav(perms),
    },
    {
      label: t('publications'),
      icon: Globe,
      href: '/publications' as const,
      show: true,
    },
    {
      label: t('editor'),
      icon: BookOpen,
      href: '/editor' as const,
      show: !!me && perms.has(PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE),
    },
    {
      label: t('myReviews'),
      icon: ClipboardList,
      href: '/assignments' as const,
      show: !!me && perms.has(PERMISSION_SLUGS.ASSIGNMENT_VIEW_OWN),
    },
    {
      label: t('copyediting'),
      icon: Pencil,
      href: '/copyedit-assignments' as const,
      show: !!me && perms.has(PERMISSION_SLUGS.COPYEDIT_VIEW_QUEUE),
    },
    {
      label: t('users'),
      icon: Users,
      href: '/journal-manager/users' as const,
      show: !!me && perms.has(PERMISSION_SLUGS.USERS_MANAGE_ROLES),
    },
    {
      label: t('emailSettings'),
      icon: Mail,
      href: '/journal-manager/email-settings' as const,
      show: !!me && perms.has(PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS),
    },
    {
      label: t('auditLog'),
      icon: ScrollText,
      href: '/journal-manager/audit-log' as const,
      show: !!me && perms.has(PERMISSION_SLUGS.AUDIT_LOG_VIEW),
    },
    {
      label: t('searchCuration'),
      icon: SlidersHorizontal,
      href: '/journal-manager/search-curation' as const,
      show: !!me && perms.has(PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE),
    },
  ].filter((item) => item.show);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t('commandPaletteTitle')}
        className="overflow-hidden p-0 shadow-2xl max-w-xl"
        aria-describedby={undefined}
      >
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink/40 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3">
          <CommandInput placeholder="Search pages and actions…" />
          <CommandList>
            <CommandEmpty>
              <span className="flex flex-col items-center gap-2 py-2">
                <Search className="h-8 w-8 text-ink/20" />
                No results found.
              </span>
            </CommandEmpty>

            {navItems.length > 0 && (
              <CommandGroup heading="Navigate">
                {navItems.map((item) => (
                  <CommandItem
                    key={item.href}
                    value={item.label}
                    onSelect={() => run(() => router.push(item.href))}
                  >
                    <item.icon className="h-4 w-4 text-ink/50 shrink-0" />
                    <span>{item.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {!!me && canBrowseAuthorSubmissionsNav(perms) && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Actions">
                  <CommandItem
                    value="new submission create draft"
                    onSelect={() => run(() => router.push('/submissions/new'))}
                  >
                    <Plus className="h-4 w-4 text-accent shrink-0" />
                    <span>New Submission</span>
                    <CommandShortcut>New</CommandShortcut>
                  </CommandItem>
                </CommandGroup>
              </>
            )}

            {!!me && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Account">
                  <CommandItem
                    value="notifications bell alerts"
                    onSelect={() => run(() => router.push('/notifications'))}
                  >
                    <Bell className="h-4 w-4 text-ink/50 shrink-0" />
                    <span>Notifications</span>
                  </CommandItem>
                  <CommandItem
                    value="logout sign out"
                    onSelect={() => void handleLogout()}
                    className="data-[selected=true]:text-danger data-[selected=true]:bg-danger/8"
                  >
                    <LogOut className="h-4 w-4 text-ink/50 shrink-0 data-[selected=true]:text-danger" />
                    <span>Sign Out</span>
                    <CommandShortcut>⇧⌘Q</CommandShortcut>
                  </CommandItem>
                </CommandGroup>
              </>
            )}

            {!me && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Account">
                  <CommandItem
                    value="login sign in"
                    onSelect={() => run(() => router.push('/login'))}
                  >
                    <ShieldCheck className="h-4 w-4 text-ink/50 shrink-0" />
                    <span>Sign In</span>
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
