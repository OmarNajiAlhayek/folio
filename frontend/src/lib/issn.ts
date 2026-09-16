const ISSN_PATTERN = /^(\d{4})-?(\d{3})([\dX])$/;

/**
 * Canonical `NNNN-NNNC`, or null when `raw` is not a valid ISSN (wrong shape or
 * wrong mod-11 check character). Mirrors backend `journals/issn.util.ts`, which
 * enforces the same rule on save.
 */
export function normalizeIssn(raw: string): string | null {
  const match = raw.trim().toUpperCase().match(ISSN_PATTERN);
  if (!match) return null;
  const [, head, tail, check] = match;
  const digits = `${head}${tail}`;
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    sum += Number(digits[i]) * (8 - i);
  }
  const expected = (11 - (sum % 11)) % 11;
  if ((expected === 10 ? 'X' : String(expected)) !== check) return null;
  return `${head}-${tail}${check}`;
}
