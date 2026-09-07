import { describe, expect, it } from 'vitest';
import { PERMISSION_SLUGS } from '@/lib/permissions';
import {
  isNavActive,
  NAV_ITEMS,
  visibleNavItems,
  type NavLabelKey,
} from './nav-items';

function labels(perms: string[], signedIn = true): NavLabelKey[] {
  return visibleNavItems({ signedIn, perms: new Set(perms) }).map(
    (item) => item.labelKey,
  );
}

const ALL_PERMISSIONS = Object.values(PERMISSION_SLUGS);

describe('visibleNavItems', () => {
  it('shows only public links when signed out', () => {
    expect(labels([], false)).toEqual(['publications', 'journals']);
  });

  it('ignores permissions when signed out', () => {
    expect(labels(ALL_PERMISSIONS, false)).toEqual([
      'publications',
      'journals',
    ]);
  });

  it('shows the author set for a plain author', () => {
    expect(labels([PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN])).toEqual([
      'publications',
      'journals',
      'dashboard',
      'submissions',
    ]);
  });

  it('shows reviewer links without author links', () => {
    expect(labels([PERMISSION_SLUGS.ASSIGNMENT_VIEW_OWN])).toEqual([
      'publications',
      'journals',
      'dashboard',
      'myReviews',
    ]);
  });

  it('shows every link for a user holding all permissions', () => {
    expect(labels(ALL_PERMISSIONS)).toHaveLength(NAV_ITEMS.length);
  });

  it('gates the editor queue and search curation on the same permission', () => {
    expect(labels([PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE])).toEqual([
      'publications',
      'journals',
      'dashboard',
      'editor',
      'searchCuration',
    ]);
  });

  it('keeps admin routes last so they collapse into the overflow menu first', () => {
    const adminKeys: NavLabelKey[] = [
      'users',
      'emailSettings',
      'auditLog',
      'searchCuration',
    ];
    const order = NAV_ITEMS.map((item) => item.labelKey);
    const firstAdminIndex = Math.min(
      ...adminKeys.map((key) => order.indexOf(key)),
    );
    const lastNonAdminIndex = Math.max(
      ...order
        .map((key, index) => (adminKeys.includes(key) ? -1 : index))
        .filter((index) => index >= 0),
    );
    expect(firstAdminIndex).toBeGreaterThan(lastNonAdminIndex);
  });

  it('has a unique href per item', () => {
    const hrefs = NAV_ITEMS.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe('isNavActive', () => {
  it('matches exact routes only on the route itself', () => {
    expect(isNavActive('/editor', '/editor', 'exact')).toBe(true);
    expect(isNavActive('/editor/42', '/editor', 'exact')).toBe(false);
  });

  it('matches prefix routes on child routes', () => {
    expect(isNavActive('/submissions', '/submissions', 'prefix')).toBe(true);
    expect(isNavActive('/submissions/42', '/submissions', 'prefix')).toBe(true);
  });

  it('does not treat a sibling route as a prefix match', () => {
    expect(isNavActive('/submissions-archive', '/submissions', 'prefix')).toBe(
      false,
    );
  });

  it('treats the empty pathname as root', () => {
    expect(isNavActive('', '/', 'exact')).toBe(true);
  });
});
