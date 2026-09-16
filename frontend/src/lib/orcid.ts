/** Canonical ORCID iD shape. Mirrors backend `auth/orcid-id.util.ts`. */
export const ORCID_PATTERN = /^(\d{4}-){3}\d{3}[\dX]$/;

/** ISO 7064 MOD 11-2 check character over the first fifteen digits. */
export function orcidCheckCharacter(firstFifteenDigits: string): string {
  let total = 0;
  for (const digit of firstFifteenDigits) {
    total = (total + Number(digit)) * 2;
  }
  const result = (12 - (total % 11)) % 11;
  return result === 10 ? 'X' : String(result);
}

/**
 * A canonical iD whose check character is correct. The API enforces the same
 * rule; checking here turns a typo into a field error instead of a failed
 * request.
 */
export function isValidOrcidId(value: string): boolean {
  if (!ORCID_PATTERN.test(value)) return false;
  const digits = value.replace(/-/g, '');
  return orcidCheckCharacter(digits.slice(0, 15)) === digits[15];
}
