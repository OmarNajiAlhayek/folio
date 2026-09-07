import type { PublicationCatalogFilters } from '@/lib/public-submissions-query';

export const queryKeys = {
  me: ['auth', 'me'] as const,
  notificationsUnread: ['notifications', 'unread-count'] as const,
  notifications: (filter: string, cursor?: string) =>
    cursor
      ? (['notifications', 'list', filter, cursor] as const)
      : (['notifications', 'list', filter] as const),
  submissions: (status?: string) =>
    status ? (['submissions', status] as const) : (['submissions'] as const),
  submission: (slug: string) => ['submission', slug] as const,
  submissionDetail: (slug: string) => ['submissionDetail', slug] as const,
  publicationsCatalog: (filters: PublicationCatalogFilters) =>
    ['publications', 'catalog', filters] as const,
  publicationDetail: (slug: string) => ['publication', slug] as const,
  publicationRelated: (slug: string) =>
    ['publication', slug, 'related'] as const,
  journals: ['journals'] as const,
  journalOptions: ['journals', 'options'] as const,
  journal: (slug: string) => ['journal', slug] as const,
  journalIssue: (slug: string, year: number, number: number) =>
    ['journal', slug, 'issue', year, number] as const,
};
