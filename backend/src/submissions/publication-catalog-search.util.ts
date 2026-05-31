import type { SelectQueryBuilder } from 'typeorm';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import type { SubmissionArticleType } from '../entities/submission-article-type.enum';

export const PUBLICATION_SEARCH_DOC_SIMILARITY_MIN = 0.28;
export const PUBLICATION_SEARCH_AUTHOR_SIMILARITY_MIN = 0.35;

export type PublicationCatalogFilters = {
  q?: string;
  author?: string;
  discipline?: string;
  articleType?: SubmissionArticleType;
  publishedFrom?: Date;
  publishedTo?: Date;
};

export function trimCatalogFilter(value: string | undefined): string | undefined {
  const t = value?.trim();
  return t && t.length > 0 ? t : undefined;
}

/** True when URL has any catalog search param set. */
export function publicationCatalogHasTextOrFilters(
  filters: PublicationCatalogFilters,
): boolean {
  return Boolean(
    filters.q ||
      filters.author ||
      filters.discipline ||
      filters.articleType ||
      filters.publishedFrom ||
      filters.publishedTo,
  );
}

export function publicationCatalogNeedsAuthorJoin(
  filters: PublicationCatalogFilters,
): boolean {
  const q = trimCatalogFilter(filters.q);
  const author = trimCatalogFilter(filters.author);
  return Boolean(q || author);
}

/**
 * Date-only YYYY-MM-DD → UTC day bounds; full ISO datetimes pass through.
 */
export function normalizePublicationPublishedAt(
  raw: string,
  bound: 'from' | 'to',
): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return bound === 'from'
      ? new Date(`${raw}T00:00:00.000Z`)
      : new Date(`${raw}T23:59:59.999Z`);
  }
  return new Date(raw);
}

export const PUBLICATION_QUICK_SEARCH_MATCH_SQL = `(
  s.publication_search_vector @@ websearch_to_tsquery('english', :pubQ)
  OR s.publication_search_vector @@ plainto_tsquery('arabic', :pubQ)
  OR s.publication_search_vector @@ plainto_tsquery('english', :pubQ)
  OR similarity(s.publication_search_document, :pubQ) > :pubDocSimMin
  OR word_similarity(:pubQ, COALESCE(author.display_name, '')) > :pubAuthorSimMin
)`;

export const PUBLICATION_QUICK_SEARCH_RANK_SQL = `GREATEST(
  ts_rank_cd(s.publication_search_vector, websearch_to_tsquery('english', :pubQ), 32),
  ts_rank_cd(s.publication_search_vector, plainto_tsquery('arabic', :pubQ), 32),
  ts_rank_cd(s.publication_search_vector, plainto_tsquery('english', :pubQ), 32),
  similarity(s.publication_search_document, :pubQ),
  word_similarity(:pubQ, COALESCE(author.display_name, ''))
)`;

/** Author filter / suggestions: pg_trgm + FTS on display_name (same family as catalog quick search). */
export const PUBLICATION_ADVANCED_AUTHOR_MATCH_SQL = `(
  word_similarity(:pubAuthor, COALESCE(author.display_name, '')) > :pubAuthorSimMin
  OR similarity(COALESCE(author.display_name, ''), :pubAuthor) > :pubAuthorSimMin
  OR COALESCE(author.display_name, '') ILIKE '%' || :pubAuthor || '%'
  OR to_tsvector('simple', COALESCE(author.display_name, ''))
    @@ plainto_tsquery('simple', :pubAuthor)
)`;

/** Rank published-author suggestions (higher = closer match). */
export const PUBLICATION_AUTHOR_SUGGESTION_RANK_SQL = `GREATEST(
  word_similarity(:pubAuthor, COALESCE(author.display_name, '')),
  similarity(COALESCE(author.display_name, ''), :pubAuthor),
  ts_rank_cd(
    to_tsvector('simple', COALESCE(author.display_name, '')),
    plainto_tsquery('simple', :pubAuthor),
    32
  ),
  CASE
    WHEN COALESCE(author.display_name, '') ILIKE '%' || :pubAuthor || '%' THEN 1
    ELSE 0
  END
)`;

export const PUBLICATION_AUTHOR_SUGGESTION_MIN_QUERY_LENGTH = 2;
export const PUBLICATION_AUTHOR_SUGGESTION_DEFAULT_LIMIT = 10;
export const PUBLICATION_AUTHOR_SUGGESTION_MAX_LIMIT = 20;

export const PUBLICATION_CATALOG_DEFAULT_LIMIT = 20;
export const PUBLICATION_CATALOG_MAX_LIMIT = 100;

export type PublicationCatalogPagination = {
  limit: number;
  offset: number;
};

export function clampPublicationCatalogPagination(
  limit?: number,
  offset?: number,
): PublicationCatalogPagination {
  const lim =
    limit != null
      ? Math.min(
          PUBLICATION_CATALOG_MAX_LIMIT,
          Math.max(1, Math.trunc(limit)),
        )
      : PUBLICATION_CATALOG_DEFAULT_LIMIT;
  const off =
    offset != null ? Math.max(0, Math.trunc(offset)) : 0;
  return { limit: lim, offset: off };
};

export type PublishedAuthorSuggestionRow = {
  displayName: string;
  publicationCount: number;
};

export function applyPublicationCatalogQuery(
  qb: SelectQueryBuilder<Submission>,
  filters: PublicationCatalogFilters,
  options?: { skipQuickSearch?: boolean },
): void {
  qb.where('s.status = :pubStatus', { pubStatus: SubmissionStatus.PUBLISHED });

  const q = options?.skipQuickSearch ? undefined : trimCatalogFilter(filters.q);
  const author = trimCatalogFilter(filters.author);

  const needsAuthor =
    Boolean(author) ||
    (!options?.skipQuickSearch && publicationCatalogNeedsAuthorJoin(filters));
  if (needsAuthor) {
    qb.innerJoinAndSelect('s.author', 'author');
  }

  if (q) {
    qb.andWhere(PUBLICATION_QUICK_SEARCH_MATCH_SQL, {
      pubQ: q,
      pubDocSimMin: PUBLICATION_SEARCH_DOC_SIMILARITY_MIN,
      pubAuthorSimMin: PUBLICATION_SEARCH_AUTHOR_SIMILARITY_MIN,
    });
    qb.orderBy(PUBLICATION_QUICK_SEARCH_RANK_SQL, 'DESC');
    qb.addOrderBy('s.publishedAt', 'DESC');
  } else {
    qb.orderBy('s.publishedAt', 'DESC');
  }

  if (author) {
    qb.andWhere(PUBLICATION_ADVANCED_AUTHOR_MATCH_SQL, {
      pubAuthor: author,
      pubAuthorSimMin: PUBLICATION_SEARCH_AUTHOR_SIMILARITY_MIN,
    });
  }

  if (filters.discipline) {
    qb.andWhere('s.discipline = :pubDiscipline', {
      pubDiscipline: filters.discipline,
    });
  }

  if (filters.articleType) {
    qb.andWhere('s.articleType = :pubArticleType', {
      pubArticleType: filters.articleType,
    });
  }

  if (filters.publishedFrom) {
    qb.andWhere('s.publishedAt >= :pubFrom', {
      pubFrom: filters.publishedFrom,
    });
  }

  if (filters.publishedTo) {
    qb.andWhere('s.publishedAt <= :pubTo', {
      pubTo: filters.publishedTo,
    });
  }
}

/** Collect bound-parameter names used in catalog search SQL (for tests). */
export function publicationCatalogBoundParamNames(): string[] {
  const fragments = [
    PUBLICATION_QUICK_SEARCH_MATCH_SQL,
    PUBLICATION_QUICK_SEARCH_RANK_SQL,
    PUBLICATION_ADVANCED_AUTHOR_MATCH_SQL,
    's.status = :pubStatus',
    's.discipline = :pubDiscipline',
    's.articleType = :pubArticleType',
    's.publishedAt >= :pubFrom',
    's.publishedAt <= :pubTo',
  ];
  const names = new Set<string>();
  for (const frag of fragments) {
    for (const m of frag.matchAll(/:([a-zA-Z][a-zA-Z0-9_]*)/g)) {
      names.add(m[1]);
    }
  }
  return [...names].sort();
}
