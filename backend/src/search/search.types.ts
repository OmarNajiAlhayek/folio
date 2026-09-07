export type PublicationDocument = {
  id: string;
  slug: string;
  title: string;
  titleAr: string;
  abstract: string;
  abstractAr: string;
  keywords: string;
  keywordsAr: string;
  authorDisplayName: string;
  /** Journal slug (`engj`) — the public URL contract, stable and facetable. */
  journalSlug: string;
  disciplines: string[];
  articleType: string;
  publishedAt: number; // unix ms
};

export type TypesenseOverrideRule = {
  id: string;
  rule: { query: string; match: 'exact' | 'contains' };
  includes?: { id: string; position: number }[];
  excludes?: { id: string }[];
};

/** Multi-way synonym (all terms are equivalent). */
export type TypesenseSynonymMulti = {
  id: string;
  synonyms: string[];
};

/** One-way synonym: searches for `root` also match `synonyms`, not vice-versa. */
export type TypesenseSynonymOneWay = {
  id: string;
  root: string;
  synonyms: string[];
};

export type TypesenseSynonym = TypesenseSynonymMulti | TypesenseSynonymOneWay;

export type SearchAnalyticsEntry = {
  q: string;
  count: number;
};

export type SearchAnalyticsResult = {
  topQueries: SearchAnalyticsEntry[];
  noResultQueries: SearchAnalyticsEntry[];
};
