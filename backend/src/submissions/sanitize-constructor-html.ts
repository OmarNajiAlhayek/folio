import sanitizeHtml from 'sanitize-html';
import type {
  ConstructorContent,
  ConstructorSection,
  RichTextBlockKind,
} from './constructor-content.types';

/**
 * TipTap paragraph / rich-text HTML allowlist.
 * Keep in sync with `frontend/src/lib/sanitize-constructor-html.ts` and
 * `docx-generator.service.ts` `buildParagraph`.
 */
export const CONSTRUCTOR_TIPTAP_ALLOWED_TAGS = [
  'p',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'ul',
  'ol',
  'li',
  'br',
] as const;

const RICH_TEXT_BLOCK_KINDS = new Set<RichTextBlockKind>([
  'acknowledgments',
  'funding',
  'conflictOfInterest',
  'dataAvailability',
]);

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

function sectionHasHtmlField(
  section: ConstructorSection,
): section is ConstructorSection & { html: string } {
  return (
    section.kind === 'paragraph' ||
    RICH_TEXT_BLOCK_KINDS.has(section.kind as RichTextBlockKind)
  );
}

export function sanitizeConstructorTipTapHtml(html: string): string {
  const sanitized = sanitizeHtml(html ?? '', {
    allowedTags: [...CONSTRUCTOR_TIPTAP_ALLOWED_TAGS],
    allowedAttributes: {},
  });
  if (!sanitized || stripHtml(sanitized).length === 0) {
    return '<p></p>';
  }
  return sanitized;
}

export function sanitizeConstructorContent(
  content: ConstructorContent | null | undefined,
): ConstructorContent | null {
  if (!content) return null;
  return {
    ...content,
    sections: content.sections.map((section) => {
      if (!sectionHasHtmlField(section)) return section;
      return {
        ...section,
        html: sanitizeConstructorTipTapHtml(section.html),
      };
    }),
  };
}
