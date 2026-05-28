import {
  applyPublicationCatalogQuery,
  normalizePublicationPublishedAt,
  publicationCatalogBoundParamNames,
  publicationCatalogNeedsAuthorJoin,
  PUBLICATION_ADVANCED_AUTHOR_MATCH_SQL,
  PUBLICATION_AUTHOR_SUGGESTION_RANK_SQL,
  PUBLICATION_QUICK_SEARCH_MATCH_SQL,
  PUBLICATION_QUICK_SEARCH_RANK_SQL,
  trimCatalogFilter,
} from './publication-catalog-search.util';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { SubmissionArticleType } from '../entities/submission-article-type.enum';

describe('publication-catalog-search.util', () => {
  it('trimCatalogFilter returns undefined for blank strings', () => {
    expect(trimCatalogFilter('  ')).toBeUndefined();
    expect(trimCatalogFilter(' hello ')).toBe('hello');
  });

  it('normalizePublicationPublishedAt uses UTC day bounds for date-only input', () => {
    expect(normalizePublicationPublishedAt('2024-06-01', 'from').toISOString()).toBe(
      '2024-06-01T00:00:00.000Z',
    );
    expect(normalizePublicationPublishedAt('2024-06-01', 'to').toISOString()).toBe(
      '2024-06-01T23:59:59.999Z',
    );
  });

  it('publicationCatalogNeedsAuthorJoin when q or author set', () => {
    expect(publicationCatalogNeedsAuthorJoin({})).toBe(false);
    expect(publicationCatalogNeedsAuthorJoin({ q: 'policy' })).toBe(true);
    expect(publicationCatalogNeedsAuthorJoin({ author: 'Smith' })).toBe(true);
  });

  it('SQL fragments use named parameters only (no string interpolation of user input)', () => {
    const frags = [
      PUBLICATION_QUICK_SEARCH_MATCH_SQL,
      PUBLICATION_QUICK_SEARCH_RANK_SQL,
      PUBLICATION_ADVANCED_AUTHOR_MATCH_SQL,
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

  it('applyPublicationCatalogQuery wires status and optional filters', () => {
    const andWhere = jest.fn().mockReturnThis();
    const where = jest.fn().mockReturnThis();
    const innerJoinAndSelect = jest.fn().mockReturnThis();
    const orderBy = jest.fn().mockReturnThis();
    const addOrderBy = jest.fn().mockReturnThis();

    const qb = {
      where,
      andWhere,
      innerJoinAndSelect,
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
    expect(innerJoinAndSelect).toHaveBeenCalledWith('s.author', 'author');
    expect(andWhere).toHaveBeenCalledWith(
      PUBLICATION_QUICK_SEARCH_MATCH_SQL,
      expect.objectContaining({ pubQ: 'metadata' }),
    );
    expect(andWhere).toHaveBeenCalledWith('s.discipline = :pubDiscipline', {
      pubDiscipline: 'العلوم الأساسية',
    });
  });
});
