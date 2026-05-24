const MAX_EXCERPT = 400;

/** Plain-text excerpt for copyedit query emails (escape handled in templates). */
export function truncateCopyeditNoteExcerpt(noteForAuthor: string): string {
  const plain = noteForAuthor.replace(/\s+/g, ' ').trim();
  if (plain.length <= MAX_EXCERPT) return plain;
  return `${plain.slice(0, MAX_EXCERPT)}…`;
}
