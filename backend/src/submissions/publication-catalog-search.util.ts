import type { SelectQueryBuilder } from 'typeorm';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import type { SubmissionArticleType } from '../entities/submission-article-type.enum';

export const PUBLICATION_SEARCH_DOC_SIMILARITY_MIN = 0.28;
export const PUBLICATION_SEARCH_AUTHOR_SIMILARITY_MIN = 0.35;

export type PublicationCatalogFilters = {
  q?: string;
  author?: string;
  /** Journal slug from the URL (`?journal=engj`), not the internal id. */
  journal?: string;
  discipline?: string;
  articleType?: SubmissionArticleType;
  publishedFrom?: Date;
  publishedTo?: Date;
};

export function trimCatalogFilter(
  value: string | undefined,
): string | undefined {
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
    filters.journal ||
    filters.discipline ||
    filters.articleType ||
    filters.publishedFrom ||
    filters.publishedTo,
  );
}

/**
 * Whether catalog search has to join `users` to evaluate its predicates.
 *
 * Always false now: the author's name is denormalized onto the submission as
 * `publication_author_normalized`, so both quick search and the advanced author
 * filter read it straight off `submissions`. The relation is still *selected*
 * for display, but as a LEFT JOIN that constrains nothing, which leaves the
 * count query free of the join entirely.
 *
 * Kept as a function rather than deleted because it names the question callers
 * are actually asking, and the answer would change again if a filter ever needs
 * a column that is not denormalized.
 */
export function publicationCatalogNeedsAuthorJoin(): boolean {
  return false;
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

/**
 * The tsquery branches take the raw query: the `english` and `arabic`
 * dictionaries do their own normalization, and folding first would hide word
 * boundaries from them.
 *
 * The trigram branches take the folded query, because
 * `publication_search_document` is stored folded — `folio_normalize_search` on
 * both sides is what makes `احمد` match `أحمد` and `هندسه` match `هندسة`.
 */
export const PUBLICATION_QUICK_SEARCH_MATCH_SQL = `(
  s.publication_search_vector @@ websearch_to_tsquery('english', :pubQ)
  OR s.publication_search_vector @@ plainto_tsquery('arabic', :pubQ)
  OR s.publication_search_vector @@ plainto_tsquery('english', :pubQ)
  OR similarity(s.publication_search_document, folio_normalize_search(:pubQ)) > :pubDocSimMin
  OR word_similarity(
    folio_normalize_search(:pubQ),
    COALESCE(s.publication_author_normalized, '')
  ) > :pubAuthorSimMin
)`;

export const PUBLICATION_QUICK_SEARCH_RANK_SQL = `GREATEST(
  ts_rank_cd(s.publication_search_vector, websearch_to_tsquery('english', :pubQ), 32),
  ts_rank_cd(s.publication_search_vector, plainto_tsquery('arabic', :pubQ), 32),
  ts_rank_cd(s.publication_search_vector, plainto_tsquery('english', :pubQ), 32),
  similarity(s.publication_search_document, folio_normalize_search(:pubQ)),
  word_similarity(
    folio_normalize_search(:pubQ),
    COALESCE(s.publication_author_normalized, '')
  )
)`;

/** TypeORM orderBy alias — avoids comma-splitting GREATEST(...) in orderBy(). */
export const PUBLICATION_QUICK_SEARCH_RANK_ALIAS = 'pub_search_rank';

/**
 * Author suggestions: pg_trgm + FTS against the joined `users` row.
 *
 * This form needs the join because the endpoint *lists authors* — it groups by
 * `author.display_name`. Catalog filtering uses
 * {@link PUBLICATION_CATALOG_AUTHOR_MATCH_SQL} instead, which needs no join.
 *
 * Both sides are folded, so an author search for `احمد` finds `أحمد`. The raw
 * ILIKE branch is kept as well, so anything the fold discards still matches the
 * way it used to.
 */
export const PUBLICATION_ADVANCED_AUTHOR_MATCH_SQL = `(
  word_similarity(
    folio_normalize_search(:pubAuthor),
    folio_normalize_search(COALESCE(author.display_name, ''))
  ) > :pubAuthorSimMin
  OR similarity(
    folio_normalize_search(COALESCE(author.display_name, '')),
    folio_normalize_search(:pubAuthor)
  ) > :pubAuthorSimMin
  OR (
    -- Guarded: a query that folds away to nothing would leave '%%', which
    -- matches every author.
    folio_normalize_search(:pubAuthor) <> ''
    AND folio_normalize_search(COALESCE(author.display_name, ''))
      ILIKE '%' || folio_normalize_search(:pubAuthor) || '%'
  )
  OR COALESCE(author.display_name, '') ILIKE '%' || :pubAuthor || '%'
  OR to_tsvector('simple', COALESCE(author.display_name, ''))
    @@ plainto_tsquery('simple', :pubAuthor)
)`;

/**
 * The same author match, read off the submission's denormalized column.
 *
 * Identical branches to the joined form above, against
 * `publication_author_normalized` — which is already folded, so the query is
 * folded to meet it and the column is used as-is. Backed by
 * `idx_submissions_publication_author_trgm`.
 */
export const PUBLICATION_CATALOG_AUTHOR_MATCH_SQL = `(
  word_similarity(
    folio_normalize_search(:pubAuthor),
    COALESCE(s.publication_author_normalized, '')
  ) > :pubAuthorSimMin
  OR similarity(
    COALESCE(s.publication_author_normalized, ''),
    folio_normalize_search(:pubAuthor)
  ) > :pubAuthorSimMin
  OR (
    folio_normalize_search(:pubAuthor) <> ''
    AND COALESCE(s.publication_author_normalized, '')
      ILIKE '%' || folio_normalize_search(:pubAuthor) || '%'
  )
  OR to_tsvector('simple', COALESCE(s.publication_author_normalized, ''))
    @@ plainto_tsquery('simple', folio_normalize_search(:pubAuthor))
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

/** TypeORM orderBy alias for author suggestions. */
export const PUBLICATION_AUTHOR_SUGGESTION_RANK_ALIAS = 'pub_author_rank';

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
      ? Math.min(PUBLICATION_CATALOG_MAX_LIMIT, Math.max(1, Math.trunc(limit)))
      : PUBLICATION_CATALOG_DEFAULT_LIMIT;
  const off = offset != null ? Math.max(0, Math.trunc(offset)) : 0;
  return { limit: lim, offset: off };
}

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

  // No author join: every predicate below reads the denormalized
  // `publication_author_normalized` column off `submissions`. The caller adds a
  // LEFT JOIN for display, which keeps this builder — and the COUNT built from
  // it — join-free.

  if (q) {
    qb.andWhere(PUBLICATION_QUICK_SEARCH_MATCH_SQL, {
      pubQ: q,
      pubDocSimMin: PUBLICATION_SEARCH_DOC_SIMILARITY_MIN,
      pubAuthorSimMin: PUBLICATION_SEARCH_AUTHOR_SIMILARITY_MIN,
    });
    // orderBy(GREATEST(...)) breaks: TypeORM splits on commas inside GREATEST.
    qb.addSelect(
      PUBLICATION_QUICK_SEARCH_RANK_SQL,
      PUBLICATION_QUICK_SEARCH_RANK_ALIAS,
    );
    qb.orderBy(PUBLICATION_QUICK_SEARCH_RANK_ALIAS, 'DESC');
    qb.addOrderBy('s.publishedAt', 'DESC');
  } else {
    qb.orderBy('s.publishedAt', 'DESC');
  }

  if (author) {
    qb.andWhere(PUBLICATION_CATALOG_AUTHOR_MATCH_SQL, {
      pubAuthor: author,
      pubAuthorSimMin: PUBLICATION_SEARCH_AUTHOR_SIMILARITY_MIN,
    });
  }

  if (filters.journal) {
    // Join rather than resolve the slug first: `journals` is nine rows of
    // reference data and `journal_id` is indexed, so this costs nothing and
    // keeps an unknown slug returning nothing instead of everything.
    qb.innerJoinAndSelect('s.journal', 'journal').andWhere(
      'journal.slug = :pubJournal',
      { pubJournal: filters.journal },
    );
  }

  if (filters.discipline) {
    qb.andWhere(':pubDiscipline = ANY(s.disciplines)', {
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
    ':pubDiscipline = ANY(s.disciplines)',
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
