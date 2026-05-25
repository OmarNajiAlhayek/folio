/**
 * Keeps the pre-save manuscript File in memory while the author navigates
 * between `/submissions/new` and `/submissions/compose/create` in the same tab.
 * (Browser File objects cannot be stored in sessionStorage.)
 */
let cachedManuscript: File | null = null;

export function readPreSlugStagedManuscript(): File | null {
  return cachedManuscript;
}

export function writePreSlugStagedManuscript(file: File | null): void {
  cachedManuscript = file;
}
