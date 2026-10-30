/**
 * Word Constructor (manuscript compose) is switched off for this release.
 * Pages, components, and API handlers stay in the tree. Flip this to `true`
 * together with `WORD_CONSTRUCTOR_ENABLED` in
 * `backend/src/submissions/word-constructor.feature.ts`.
 */
export const CONSTRUCTOR_ENTRY_POINTS_ENABLED = false;

/** A stored constructor docx reads as a normal manuscript while the builder is hidden. */
export function visibleFileKind(kind: string | null | undefined): string {
  const value = kind && kind.length > 0 ? kind : 'manuscript';
  if (!CONSTRUCTOR_ENTRY_POINTS_ENABLED && value === 'manuscript_constructor') {
    return 'manuscript';
  }
  return value;
}
