import { createHash } from 'node:crypto';

/** ISO 7064 MOD 11-2, as ORCID computes its check character. */
function orcidCheckCharacter(firstFifteenDigits: string): string {
  let total = 0;
  for (const digit of firstFifteenDigits) {
    total = (total + Number(digit)) * 2;
  }
  const result = (12 - (total % 11)) % 11;
  return result === 10 ? 'X' : String(result);
}

/**
 * A valid ORCID iD derived from `seed`. Registration requires one and each
 * account's must be unique, so a worker gets a stable iD from its email and a
 * one-off registration passes something unique.
 */
export function orcidForSeed(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex');
  const digits = [...hex.slice(0, 15)]
    .map((c) => String(parseInt(c, 16) % 10))
    .join('');
  const full = `${digits}${orcidCheckCharacter(digits)}`;
  return (full.match(/.{4}/g) ?? []).join('-');
}
