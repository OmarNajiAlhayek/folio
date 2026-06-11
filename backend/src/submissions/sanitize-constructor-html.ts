import sanitizeHtml, { type Attributes } from 'sanitize-html';
import type {
  ConstructorContent,
  ConstructorReferenceEntry,
  ConstructorSection,
  RichTextBlockKind,
} from './constructor-content.types';
import {
  referenceEntryHasContent,
  resolveReferenceEntryHtml,
  sanitizeConstructorLinkHref,
} from './constructor-rich-text';

/**
 * TipTap paragraph / rich-text HTML allowlist.
 * Keep in sync with `frontend/src/lib/sanitize-constructor-html.ts` and
 * `docx-generator.service.ts` inline HTML walker.
 */
export const CONSTRUCTOR_TIPTAP_ALLOWED_TAGS = [
  'p',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'sup',
  'sub',
  'a',
  'ul',
  'ol',
  'li',
  'br',
  'span',
  'img',
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

function normalizeReferenceEntry(
  entry: ConstructorReferenceEntry,
): ConstructorReferenceEntry {
  const html = resolveReferenceEntryHtml(entry);
  const next: ConstructorReferenceEntry = {
    lang: entry.lang,
    html,
    ...(entry.doi?.trim() ? { doi: entry.doi.trim() } : {}),
  };
  return next;
}

const ALLOWED_DIR = new Set(['ltr', 'rtl']);

export function sanitizeConstructorTipTapHtml(html: string): string {
  const sanitized = sanitizeHtml(html ?? '', {
    allowedTags: [...CONSTRUCTOR_TIPTAP_ALLOWED_TAGS],
    allowedAttributes: {
      a: ['href'],
      span: ['dir'],
      sup: ['data-footnote-id', 'class'],
      img: ['data-file-id', 'alt', 'class'],
    },
    transformTags: {
      a: (tagName, attribs) => {
        const safe = sanitizeConstructorLinkHref(attribs.href);
        if (!safe) {
          return { tagName: 'span', attribs: {} as Attributes };
        }
        return { tagName, attribs: { href: safe } };
      },
      span: (_tagName, attribs) => {
        const dir = attribs.dir?.toLowerCase();
        if (dir && ALLOWED_DIR.has(dir)) {
          return { tagName: 'span', attribs: { dir } as Attributes };
        }
        return { tagName: 'span', attribs: {} as Attributes };
      },
      img: (_tagName, attribs) => {
        const fileId = attribs['data-file-id']?.trim();
        if (!fileId || attribs.src) {
          return { tagName: 'span', attribs: {} as Attributes };
        }
        return {
          tagName: 'img',
          attribs: {
            'data-file-id': fileId,
            ...(attribs.alt ? { alt: attribs.alt.slice(0, 500) } : {}),
            class: 'folio-inline-image',
          } as Attributes,
        };
      },
      sup: (_tagName, attribs) => {
        const footnoteId = attribs['data-footnote-id']?.trim();
        if (!footnoteId) {
          return { tagName: 'sup', attribs: {} as Attributes };
        }
        return {
          tagName: 'sup',
          attribs: {
            'data-footnote-id': footnoteId,
            class: 'folio-footnote-ref',
          } as Attributes,
        };
      },
    },
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
    ...(content.footnotes?.length
      ? {
          footnotes: content.footnotes.map((fn) => ({
            ...fn,
            text: sanitizeConstructorTipTapHtml(fn.text),
          })),
        }
      : {}),
    sections: content.sections.map((section) => {
      if (section.kind === 'references') {
        return {
          ...section,
          items: section.items.map((item) => normalizeReferenceEntry(item)),
        };
      }
      if (!sectionHasHtmlField(section)) return section;
      return {
        ...section,
        html: sanitizeConstructorTipTapHtml(section.html),
      };
    }),
  };
}

export { referenceEntryHasContent };
