import { describe, expect, it } from 'vitest';
import {
  buildPublicSubmissionsQuery,
  parsePublicationCatalogFilters,
  publicationCatalogFiltersActive,
} from './public-submissions-query';

/**
 * The catalog filter set is a URL contract: every key here has to survive a
 * round-trip through the query string, or a shared link loses a filter.
 */
describe('public-submissions-query journal filter', () => {
  it('parses ?journal= out of the URL', () => {
    const filters = parsePublicationCatalogFilters(
      new URLSearchParams('journal=engj&q=sensors'),
    );

    expect(filters.journal).toBe('engj');
    expect(filters.q).toBe('sensors');
  });

  it('round-trips the journal slug back into the query string', () => {
    expect(buildPublicSubmissionsQuery({ journal: 'medj' })).toBe(
      '?journal=medj',
    );
  });

  it('counts a journal-only selection as an active filter', () => {
    expect(publicationCatalogFiltersActive({ journal: 'engj' })).toBe(true);
    expect(publicationCatalogFiltersActive({})).toBe(false);
  });

  it('drops a blank journal rather than sending an empty filter', () => {
    const filters = parsePublicationCatalogFilters(
      new URLSearchParams('journal=%20'),
    );

    expect(filters.journal).toBeUndefined();
    expect(buildPublicSubmissionsQuery({ journal: '   ' })).toBe('');
  });
});
