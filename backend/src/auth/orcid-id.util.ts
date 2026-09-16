/** Canonical ORCID iD: 0000-0000-0000-000X */
const ORCID_PATTERN = /^(\d{4}-){3}\d{3}[\dX]$/;

export function normalizeOrcidId(raw: string): string | null {
  const trimmed = raw.trim().toUpperCase();
  if (!ORCID_PATTERN.test(trimmed)) {
    return null;
  }
  return trimmed;
}

/**
 * ORCID check character (ISO 7064 MOD 11-2) over the first fifteen digits.
 * https://support.orcid.org/hc/en-us/articles/360006897674
 */
export function orcidCheckCharacter(firstFifteenDigits: string): string {
  let total = 0;
  for (const digit of firstFifteenDigits) {
    total = (total + Number(digit)) * 2;
  }
  const result = (12 - (total % 11)) % 11;
  return result === 10 ? 'X' : String(result);
}

/**
 * Canonical ORCID iD with a correct check character, or null.
 *
 * Stricter than {@link normalizeOrcidId}, which checks the shape only. Use it
 * wherever a person types the iD: ORCID is the primary identifier of every
 * account (Damascus University, 2026-09-14), and one mistyped digit would tie
 * a researcher's work to a stranger's record.
 */
export function normalizeValidOrcidId(raw: string): string | null {
  const id = normalizeOrcidId(raw);
  if (!id) return null;
  const digits = id.replace(/-/g, '');
  return orcidCheckCharacter(digits.slice(0, 15)) === digits[15] ? id : null;
}

export function orcidUriToId(uri: string): string | null {
  const match = uri.match(/(\d{4}-\d{4}-\d{4}-\d{3}[\dX])/i);
  if (!match?.[1]) {
    return null;
  }
  return normalizeOrcidId(match[1]);
}
