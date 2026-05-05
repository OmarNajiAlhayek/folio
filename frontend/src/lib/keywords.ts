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
