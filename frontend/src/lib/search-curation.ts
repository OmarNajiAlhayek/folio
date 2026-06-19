export type SearchCurationTab = 'overrides' | 'synonyms' | 'analytics';

export type SearchOverride = {
  id: string;
  rule: { query: string; match: 'exact' | 'contains' };
  includes?: { id: string; position: number }[];
  excludes?: { id: string }[];
};

export type SearchSynonym = {
  id: string;
  root?: string;
  synonyms: string[];
};

export type SearchStatus = {
  enabled: boolean;
  collectionReady: boolean;
  documentCount?: number;
};

export type SearchAnalyticsEntry = { q: string; count: number };

export type SearchAnalytics = {
  topQueries: SearchAnalyticsEntry[];
  noResultQueries: SearchAnalyticsEntry[];
};

export type ArticleLabel = {
  id: string;
  slug: string | null;
  title: string;
};

export type OverrideIncludeEntry = {
  article: ArticleLabel;
  position: number;
};

export type OverrideFormState = {
  id: string;
  query: string;
  match: 'exact' | 'contains';
  includes: OverrideIncludeEntry[];
  excludes: ArticleLabel[];
};

export type SynonymFormState = {
  id: string;
  root: string;
  synonymsRaw: string;
};

export const EMPTY_OVERRIDE: OverrideFormState = {
  id: '',
  query: '',
  match: 'exact',
  includes: [],
  excludes: [],
};

export const EMPTY_SYNONYM: SynonymFormState = {
  id: '',
  root: '',
  synonymsRaw: '',
};

export function collectOverrideArticleIds(
  overrides: SearchOverride[],
): string[] {
  const ids = new Set<string>();
  for (const ov of overrides) {
    for (const inc of ov.includes ?? []) ids.add(inc.id);
    for (const exc of ov.excludes ?? []) ids.add(exc.id);
  }
  return [...ids];
}

export function labelsToMap(labels: ArticleLabel[]): Map<string, ArticleLabel> {
  return new Map(labels.map((l) => [l.id, l]));
}

export function articleFromLabel(
  label: ArticleLabel | undefined,
  id: string,
): ArticleLabel {
  return (
    label ?? {
      id,
      slug: id,
      title: id,
    }
  );
}
