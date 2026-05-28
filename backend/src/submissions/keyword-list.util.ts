export const KEYWORD_MAX_COUNT = 6;
export const KEYWORD_MAX_TOKEN_LENGTH = 80;

/** Normalize AI keyword suggestions (trim, dedupe, cap). */
export function normalizeKeywordSuggestions(
  items: string[],
  locale: 'en' | 'ar',
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > KEYWORD_MAX_TOKEN_LENGTH) continue;
    const key = locale === 'en' ? trimmed.toLowerCase() : trimmed;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= KEYWORD_MAX_COUNT) break;
  }
  return out;
}

export function hasKeywordLanguagePair(
  title: string | null | undefined,
  abstract: string | null | undefined,
): boolean {
  return Boolean(title?.trim() && abstract?.trim());
}
