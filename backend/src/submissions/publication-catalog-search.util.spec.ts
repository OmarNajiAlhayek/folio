import {
  applyPublicationCatalogQuery,
  publicationCatalogHasTextOrFilters,
  clampPublicationCatalogPagination,
  normalizePublicationPublishedAt,
  publicationCatalogBoundParamNames,
  publicationCatalogNeedsAuthorJoin,
  PUBLICATION_CATALOG_DEFAULT_LIMIT,
  PUBLICATION_CATALOG_MAX_LIMIT,
  PUBLICATION_ADVANCED_AUTHOR_MATCH_SQL,
  PUBLICATION_AUTHOR_SUGGESTION_RANK_SQL,
  PUBLICATION_CATALOG_AUTHOR_MATCH_SQL,
  PUBLICATION_QUICK_SEARCH_MATCH_SQL,
  PUBLICATION_QUICK_SEARCH_RANK_ALIAS,
  PUBLICATION_QUICK_SEARCH_RANK_SQL,
  trimCatalogFilter,
} from './publication-catalog-search.util';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { SubmissionArticleType } from '../entities/submission-article-type.enum';

describe('publication-catalog-search.util', () => {
  it('clampPublicationCatalogPagination applies defaults and bounds', () => {
    expect(clampPublicationCatalogPagination()).toEqual({
      limit: PUBLICATION_CATALOG_DEFAULT_LIMIT,
      offset: 0,
    });
    expect(clampPublicationCatalogPagination(500, -3)).toEqual({
      limit: PUBLICATION_CATALOG_MAX_LIMIT,
      offset: 0,
    });
  });

  it('trimCatalogFilter returns undefined for blank strings', () => {
    expect(trimCatalogFilter('  ')).toBeUndefined();
    expect(trimCatalogFilter(' hello ')).toBe('hello');
  });

  it('normalizePublicationPublishedAt uses UTC day bounds for date-only input', () => {
    expect(
      normalizePublicationPublishedAt('2024-06-01', 'from').toISOString(),
    ).toBe('2024-06-01T00:00:00.000Z');
    expect(
      normalizePublicationPublishedAt('2024-06-01', 'to').toISOString(),
    ).toBe('2024-06-01T23:59:59.999Z');
  });

  it('publicationCatalogNeedsAuthorJoin is never true now the name is denormalized', () => {
    // Every catalog predicate reads `publication_author_normalized` off the
    // submission, so no filter combination can force a join to `users`.
    expect(publicationCatalogNeedsAuthorJoin()).toBe(false);
  });

  it('catalog author matching reads the submission, not a joined users row', () => {
    expect(PUBLICATION_CATALOG_AUTHOR_MATCH_SQL).toContain(
      's.publication_author_normalized',
    );
    expect(PUBLICATION_CATALOG_AUTHOR_MATCH_SQL).not.toContain('author.');
    // Quick search reads it too, so `q` alone never needs the join either.
    expect(PUBLICATION_QUICK_SEARCH_MATCH_SQL).toContain(
      's.publication_author_normalized',
    );
    expect(PUBLICATION_QUICK_SEARCH_MATCH_SQL).not.toContain('author.');
    expect(PUBLICATION_QUICK_SEARCH_RANK_SQL).not.toContain('author.');
  });

  it('author suggestions still use the joined form, because they list authors', () => {
    // That endpoint groups by author.display_name, so the join is the point.
    expect(PUBLICATION_ADVANCED_AUTHOR_MATCH_SQL).toContain(
      'author.display_name',
    );
  });

  it('SQL fragments use named parameters only (no string interpolation of user input)', () => {
    const frags = [
      PUBLICATION_QUICK_SEARCH_MATCH_SQL,
      PUBLICATION_QUICK_SEARCH_RANK_SQL,
      PUBLICATION_ADVANCED_AUTHOR_MATCH_SQL,
      PUBLICATION_CATALOG_AUTHOR_MATCH_SQL,
      PUBLICATION_AUTHOR_SUGGESTION_RANK_SQL,
    ];
    for (const sql of frags) {
      expect(sql).not.toMatch(/\$\{|\$\d|'\s*\+|concat\(/i);
      expect(sql).toMatch(/:[a-zA-Z][a-zA-Z0-9_]*/);
    }
    expect(publicationCatalogBoundParamNames()).toEqual(
      expect.arrayContaining([
        'pubQ',
        'pubAuthor',
        'pubDocSimMin',
        'pubAuthorSimMin',
      ]),
    );
    expect(PUBLICATION_ADVANCED_AUTHOR_MATCH_SQL).toMatch(/plainto_tsquery/);
    expect(PUBLICATION_ADVANCED_AUTHOR_MATCH_SQL).toMatch(/similarity\(/);
    expect(PUBLICATION_AUTHOR_SUGGESTION_RANK_SQL).toMatch(/ts_rank_cd/);
  });

  it('applyPublicationCatalogQuery filters by journal slug via a join', () => {
    const andWhere = jest.fn().mockReturnThis();
    const innerJoinAndSelect = jest.fn().mockReturnValue({ andWhere });
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere,
      innerJoinAndSelect,
      addSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
    } as unknown as import('typeorm').SelectQueryBuilder<Submission>;

    applyPublicationCatalogQuery(qb, { journal: 'engj' });

    // Joined-and-selected under the `journal` alias so the catalog card can
    // name the journal without a second query.
    expect(innerJoinAndSelect).toHaveBeenCalledWith('s.journal', 'journal');
    expect(andWhere).toHaveBeenCalledWith('journal.slug = :pubJournal', {
      pubJournal: 'engj',
    });
  });

  it('publicationCatalogHasTextOrFilters counts a journal-only filter', () => {
    expect(publicationCatalogHasTextOrFilters({ journal: 'engj' })).toBe(true);
    expect(publicationCatalogHasTextOrFilters({})).toBe(false);
  });

  it('applyPublicationCatalogQuery wires status and optional filters', () => {
    const andWhere = jest.fn().mockReturnThis();
    const where = jest.fn().mockReturnThis();
    const innerJoinAndSelect = jest.fn().mockReturnThis();
    const addSelect = jest.fn().mockReturnThis();
    const orderBy = jest.fn().mockReturnThis();
    const addOrderBy = jest.fn().mockReturnThis();

    const qb = {
      where,
      andWhere,
      innerJoinAndSelect,
      addSelect,
      orderBy,
      addOrderBy,
    } as unknown as import('typeorm').SelectQueryBuilder<Submission>;

    applyPublicationCatalogQuery(qb, {
      q: 'metadata',
      discipline: 'العلوم الأساسية',
      articleType: SubmissionArticleType.REVIEW_ARTICLE,
    });

    expect(where).toHaveBeenCalledWith('s.status = :pubStatus', {
      pubStatus: SubmissionStatus.PUBLISHED,
    });
    // The author relation is no longer joined to satisfy a predicate; the
    // caller adds a LEFT JOIN purely to select it for display.
    expect(innerJoinAndSelect).not.toHaveBeenCalledWith('s.author', 'author');
    expect(andWhere).toHaveBeenCalledWith(
      PUBLICATION_QUICK_SEARCH_MATCH_SQL,
      expect.objectContaining({ pubQ: 'metadata' }),
    );
    expect(addSelect).toHaveBeenCalledWith(
      PUBLICATION_QUICK_SEARCH_RANK_SQL,
      PUBLICATION_QUICK_SEARCH_RANK_ALIAS,
    );
    expect(orderBy).toHaveBeenCalledWith(
      PUBLICATION_QUICK_SEARCH_RANK_ALIAS,
      'DESC',
    );
    expect(andWhere).toHaveBeenCalledWith(
      ':pubDiscipline = ANY(s.disciplines)',
      {
        pubDiscipline: 'العلوم الأساسية',
      },
    );
  });
});
