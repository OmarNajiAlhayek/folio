import type { ConstructorContent } from './constructor-content.types';

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, '') // strip Arabic diacritics
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract plain-text strings from every references section in the content. */
export function extractConstructorReferenceTexts(
  content: ConstructorContent,
): string[] {
  const texts: string[] = [];
  for (const section of content.sections ?? []) {
    if (section.kind !== 'references') continue;
    for (const item of section.items ?? []) {
      const raw = item.html ? stripHtml(item.html) : (item.text ?? '');
      if (raw.trim()) texts.push(raw);
    }
  }
  return texts;
}

/**
 * Count how many reference strings contain at least one published journal
 * article title (English or Arabic). Titles shorter than 10 characters are
 * skipped to avoid accidental substring matches.
 */
export function countJournalSelfCitations(
  refTexts: string[],
  publishedTitles: string[],
): number {
  const targets = publishedTitles.map(normalize).filter((t) => t.length >= 10);

  if (targets.length === 0) return 0;

  let count = 0;
  for (const ref of refTexts) {
    const normalizedRef = normalize(ref);
    if (targets.some((title) => normalizedRef.includes(title))) {
      count++;
    }
  }
  return count;
}
