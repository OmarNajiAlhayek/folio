import type { LucideIcon } from 'lucide-react';
import {
  BookMarked,
  BookOpen,
  ClipboardList,
  FileText,
  Globe,
  LayoutDashboard,
  Mail,
  Pencil,
  ScrollText,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import {
  canBrowseAuthorSubmissionsNav,
  PERMISSION_SLUGS,
} from '@/lib/permissions';

/** Route literals, kept narrow so `next-intl`'s typed `Link` accepts them without a cast. */
export type NavHref =
  | '/publications'
  | '/dashboard'
  | '/submissions'
  | '/editor'
  | '/section-editor'
  | '/assignments'
  | '/copyedit-assignments'
  | '/journal-manager/users'
  | '/journal-manager/email-settings'
  | '/journal-manager/audit-log'
  | '/journal-manager/search-curation';

/** Message key inside the `Nav` namespace (`messages/{en,ar}.json`). */
export type NavLabelKey =
  | 'publications'
  | 'dashboard'
  | 'submissions'
  | 'editor'
  | 'sectionEditor'
  | 'myReviews'
  | 'copyediting'
  | 'users'
  | 'emailSettings'
  | 'auditLog'
  | 'searchCuration';

export type NavVisibilityContext = {
  signedIn: boolean;
  perms: Set<string>;
};

export type NavItem = {
  href: NavHref;
  labelKey: NavLabelKey;
  match: 'exact' | 'prefix';
  icon: LucideIcon;
  isVisible: (ctx: NavVisibilityContext) => boolean;
};

/**
 * Single source of truth for the header, the mobile drawer and the command palette.
 *
 * Array order is also the **overflow priority order**: the header keeps as many leading items
 * as fit and collapses the tail into the "More" menu, so the most broadly useful destinations
 * come first and the `/journal-manager/*` admin routes collapse first.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: '/publications',
    labelKey: 'publications',
    match: 'prefix',
    icon: Globe,
    isVisible: () => true,
  },
  {
    href: '/dashboard',
    labelKey: 'dashboard',
    match: 'exact',
    icon: LayoutDashboard,
    isVisible: ({ signedIn }) => signedIn,
  },
  {
    href: '/submissions',
    labelKey: 'submissions',
    match: 'prefix',
    icon: FileText,
    isVisible: ({ signedIn, perms }) =>
      signedIn && canBrowseAuthorSubmissionsNav(perms),
  },
  {
    href: '/editor',
    labelKey: 'editor',
    match: 'exact',
    icon: BookOpen,
    isVisible: ({ signedIn, perms }) =>
      signedIn && perms.has(PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE),
  },
  {
    href: '/section-editor',
    labelKey: 'sectionEditor',
    match: 'exact',
    icon: BookMarked,
    isVisible: ({ signedIn, perms }) =>
      signedIn && perms.has(PERMISSION_SLUGS.SUBMISSION_VIEW_SECTION_QUEUE),
  },
  {
    href: '/assignments',
    labelKey: 'myReviews',
    match: 'prefix',
    icon: ClipboardList,
    isVisible: ({ signedIn, perms }) =>
      signedIn && perms.has(PERMISSION_SLUGS.ASSIGNMENT_VIEW_OWN),
  },
  {
    href: '/copyedit-assignments',
    labelKey: 'copyediting',
    match: 'prefix',
    icon: Pencil,
    isVisible: ({ signedIn, perms }) =>
      signedIn && perms.has(PERMISSION_SLUGS.COPYEDIT_VIEW_QUEUE),
  },
  {
    href: '/journal-manager/users',
    labelKey: 'users',
    match: 'prefix',
    icon: Users,
    isVisible: ({ signedIn, perms }) =>
      signedIn && perms.has(PERMISSION_SLUGS.USERS_MANAGE_ROLES),
  },
  {
    href: '/journal-manager/email-settings',
    labelKey: 'emailSettings',
    match: 'prefix',
    icon: Mail,
    isVisible: ({ signedIn, perms }) =>
      signedIn && perms.has(PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS),
  },
  {
    href: '/journal-manager/audit-log',
    labelKey: 'auditLog',
    match: 'prefix',
    icon: ScrollText,
    isVisible: ({ signedIn, perms }) =>
      signedIn && perms.has(PERMISSION_SLUGS.AUDIT_LOG_VIEW),
  },
  {
    href: '/journal-manager/search-curation',
    labelKey: 'searchCuration',
    match: 'prefix',
    icon: SlidersHorizontal,
    isVisible: ({ signedIn, perms }) =>
      signedIn && perms.has(PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE),
  },
];

export function visibleNavItems(ctx: NavVisibilityContext): NavItem[] {
  return NAV_ITEMS.filter((item) => item.isVisible(ctx));
}

/** Shared active-route test: `exact` matches the path, `prefix` also matches child routes. */
export function isNavActive(
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
