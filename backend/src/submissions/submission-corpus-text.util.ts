import type { Submission } from '../entities/submission.entity';
import type {
  ConstructorContent,
  ConstructorSection,
} from './constructor-content.types';
import { stripConstructorHtml } from './constructor-content-utils';

/** Minimum stripped plain-text length before calling ai-service corpus detect. */
export const MIN_CORPUS_PLAIN_TEXT_CHARS = 80;

/** Bound embed/query cost for very long constructor manuscripts (v1). */
export const MAX_CORPUS_PLAIN_TEXT_CHARS = 50_000;

function append(parts: string[], value: string | null | undefined): void {
  const t = value?.trim();
  if (t) parts.push(t);
}

function sectionPlainParts(section: ConstructorSection): string[] {
  switch (section.kind) {
    case 'title':
    case 'heading1':
    case 'heading2':
    case 'heading3':
      return section.text.trim() ? [section.text.trim()] : [];
    case 'abstract': {
      const bits: string[] = [];
      append(bits, section.text);
      append(bits, section.keywords);
      return bits;
    }
    case 'paragraph':
    case 'acknowledgments':
    case 'funding':
    case 'conflictOfInterest':
    case 'dataAvailability': {
      const plain = stripConstructorHtml(section.html);
      return plain ? [plain] : [];
    }
    case 'table': {
      const cells = section.rows.flatMap((row) =>
        row.map((c) => c.trim()).filter(Boolean),
      );
      append(cells, section.notes);
      return cells;
    }
    case 'equation':
      return section.latex.trim() ? [section.latex.trim()] : [];
    case 'image':
      return section.caption.trim() ? [section.caption.trim()] : [];
    case 'references':
      return [];
    case 'authors':
      return section.authors
        .map((a) => a.fullName.trim())
        .filter((n) => n.length > 0);
    default:
      return [];
  }
}

function fromConstructor(content: ConstructorContent | null | undefined): string {
  if (!content?.sections?.length) return '';
  const parts: string[] = [];
  for (const section of content.sections) {
    parts.push(...sectionPlainParts(section));
  }
  return parts.join('\n\n').trim();
}

function metadataFallback(s: Submission): string {
  const title = (s.titleAr?.trim() || s.title?.trim() || '').trim();
  const abstract = (s.abstractAr?.trim() || s.abstract?.trim() || '').trim();
  const keywords = [s.keywordsAr, s.keywords]
    .map((k) => k?.trim())
    .filter((k): k is string => !!k)
    .join(', ');
  return [title, abstract, keywords].filter(Boolean).join('\n\n').trim();
}

/** Plain text for corpus similarity (constructor walk, then metadata fallback). */
export function buildSubmissionCorpusPlainText(s: Submission): string {
  const fromCtor = fromConstructor(s.constructorContent);
  const raw = fromCtor || metadataFallback(s);
  if (raw.length <= MAX_CORPUS_PLAIN_TEXT_CHARS) {
    return raw;
  }
  return raw.slice(0, MAX_CORPUS_PLAIN_TEXT_CHARS);
}

export function isCorpusPlainTextSufficient(plain: string): boolean {
  return plain.trim().length >= MIN_CORPUS_PLAIN_TEXT_CHARS;
}
