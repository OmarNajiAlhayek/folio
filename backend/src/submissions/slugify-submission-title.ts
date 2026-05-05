const MAX_SLUG_LENGTH = 120;

/**
 * Deterministic slug from submission title (Unicode-aware).
 * NFKC, whitespace → hyphen, Latin lowercased, non letter/number → hyphen, length cap.
 */
export function slugifySubmissionTitle(title: string): string {
  let s = title.normalize('NFKC').trim();
  s = s.replace(/\s+/gu, '-');
  s = s.toLowerCase();
  s = s.replace(/[^\p{L}\p{N}-]+/gu, '-');
  s = s.replace(/-+/g, '-').replace(/^-|-$/g, '');

  if (s.length > MAX_SLUG_LENGTH) {
    s = s.slice(0, MAX_SLUG_LENGTH);
    const lastHyphen = s.lastIndexOf('-');
    if (lastHyphen > 0) {
      s = s.slice(0, lastHyphen);
    }
  }

  return s || 'untitled';
}
