/**
 * ISSN validation (ISO 3297): `NNNN-NNNC`, where the check character C is the
 * mod-11 checksum of the first seven digits weighted 8 down to 2, written `X`
 * when it comes out as 10.
 *
 * The check digit is the point. A transposed pair of digits still matches the
 * shape, and a harvester that indexes the wrong number files this journal's
 * records under somebody else's title.
 */
const ISSN_PATTERN = /^(\d{4})-?(\d{3})([\dX])$/;

export function issnCheckCharacter(firstSevenDigits: string): string {
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    sum += Number(firstSevenDigits[i]) * (8 - i);
  }
  const check = (11 - (sum % 11)) % 11;
  return check === 10 ? 'X' : String(check);
}

/**
 * Canonical `NNNN-NNNC`, or null when `raw` is not a valid ISSN. Tolerates a
 * missing hyphen and a lowercase `x`, which is how numbers arrive when pasted.
 */
export function normalizeIssn(raw: string): string | null {
  const match = raw.trim().toUpperCase().match(ISSN_PATTERN);
  if (!match) return null;
  const [, head, tail, check] = match;
  if (issnCheckCharacter(`${head}${tail}`) !== check) return null;
  return `${head}-${tail}${check}`;
}
