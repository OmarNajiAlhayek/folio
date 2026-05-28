/** Mirrors backend parseKeywordList (comma/semicolon-separated). */
export function parseKeywordsFromStorage(
  raw: string | null | undefined,
): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;]/)
    .map((k) => k.trim())
    .filter(Boolean);
}

export function serializeKeywords(tags: string[]): string {
  return tags
    .map((t) => t.trim())
    .filter(Boolean)
    .join(", ");
}

export const KEYWORD_MAX_TAGS = 6;
export const KEYWORD_MAX_SERIALIZED_LENGTH = 800;

export function keywordDedupeKey(term: string, locale: "en" | "ar"): string {
  return locale === "en" ? term.trim().toLowerCase() : term.trim();
}

/** Suggestions that are not already present and can still fit under maxTags. */
export function pendingKeywordSuggestions(
  suggestions: string[],
  existing: string[],
  locale: "en" | "ar",
  maxTags = KEYWORD_MAX_TAGS,
): string[] {
  if (existing.length >= maxTags) return [];
  const seen = new Set(existing.map((t) => keywordDedupeKey(t, locale)));
  const out: string[] = [];
  for (const raw of suggestions) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = keywordDedupeKey(trimmed, locale);
    if (seen.has(key)) continue;
    out.push(trimmed);
    seen.add(key);
  }
  return out;
}

/** Merge suggestions into existing tags (EN: case-insensitive dedupe). */
export function mergeKeywordTags(
  existing: string[],
  incoming: string[],
  locale: "en" | "ar",
  maxTags = KEYWORD_MAX_TAGS,
  maxSerializedLength = KEYWORD_MAX_SERIALIZED_LENGTH,
): string[] {
  const seen = new Set(
    existing.map((t) => keywordDedupeKey(t, locale)),
  );
  const out = [...existing];
  for (const raw of incoming) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = keywordDedupeKey(trimmed, locale);
    if (seen.has(key)) continue;
    if (out.length >= maxTags) break;
    const next = [...out, trimmed];
    if (serializeKeywords(next).length > maxSerializedLength) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export type KeywordAddFailure = "max" | "duplicate" | "too_long";

export type KeywordAddResult = {
  tags: string[];
  addedCount: number;
  failure?: KeywordAddFailure;
};

function failureAddingOne(
  existing: string[],
  term: string,
  locale: "en" | "ar",
  maxTags = KEYWORD_MAX_TAGS,
  maxSerializedLength = KEYWORD_MAX_SERIALIZED_LENGTH,
): KeywordAddFailure | undefined {
  const trimmed = term.trim();
  if (!trimmed) return undefined;
  if (existing.length >= maxTags) return "max";
  const key = keywordDedupeKey(trimmed, locale);
  if (existing.some((t) => keywordDedupeKey(t, locale) === key)) {
    return "duplicate";
  }
  const next = [...existing, trimmed];
  if (serializeKeywords(next).length > maxSerializedLength) return "too_long";
  return undefined;
}

/** Add one suggested keyword; reports why nothing changed. */
export function addSuggestedKeyword(
  existing: string[],
  term: string,
  locale: "en" | "ar",
  maxTags = KEYWORD_MAX_TAGS,
  maxSerializedLength = KEYWORD_MAX_SERIALIZED_LENGTH,
): KeywordAddResult {
  const tags = mergeKeywordTags(
    existing,
    [term],
    locale,
    maxTags,
    maxSerializedLength,
  );
  const addedCount = tags.length - existing.length;
  if (addedCount > 0) return { tags, addedCount };
  return {
    tags: existing,
    addedCount: 0,
    failure: failureAddingOne(
      existing,
      term,
      locale,
      maxTags,
      maxSerializedLength,
    ),
  };
}

/** Add many suggestions; failure set when nothing was added. */
export function addAllSuggestedKeywords(
  existing: string[],
  suggestions: string[],
  locale: "en" | "ar",
): KeywordAddResult {
  const tags = mergeKeywordTags(existing, suggestions, locale);
  const addedCount = tags.length - existing.length;
  if (addedCount > 0) return { tags, addedCount };
  if (existing.length >= KEYWORD_MAX_TAGS) {
    return { tags: existing, addedCount: 0, failure: "max" };
  }
  const pending = pendingKeywordSuggestions(suggestions, existing, locale);
  if (pending.length === 0) {
    return { tags: existing, addedCount: 0, failure: "duplicate" };
  }
  return { tags: existing, addedCount: 0 };
}
