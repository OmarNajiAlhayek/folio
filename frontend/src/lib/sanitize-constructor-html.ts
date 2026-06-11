import DOMPurify from 'dompurify';
import type {
  ConstructorContent,
  ConstructorReferenceEntry,
  ConstructorSection,
  RichTextBlockKind,
} from '@/lib/constructor-content.types';
import {
  referenceEntryHasContent,
  resolveReferenceEntryHtml,
  sanitizeConstructorLinkHref,
} from '@/lib/constructor-rich-text';

/**
 * TipTap paragraph / rich-text HTML allowlist.
 * Keep in sync with `backend/src/submissions/sanitize-constructor-html.ts`.
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

/** MathML + structure tags KaTeX may emit (DOMPurify forbids many by default). */
const KATEX_EXTRA_TAGS = [
  'math',
  'semantics',
  'annotation',
  'mrow',
  'mi',
  'mo',
  'mn',
  'msup',
  'msub',
  'msubsup',
  'mfrac',
  'mroot',
  'msqrt',
  'mtext',
  'mtable',
  'mtr',
  'mtd',
  'munder',
  'mover',
  'munderover',
  'mpadded',
  'mphantom',
  'menclose',
  'mstyle',
  'mspace',
] as const;

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
  return {
    lang: entry.lang,
    html,
    ...(entry.doi?.trim() ? { doi: entry.doi.trim() } : {}),
  };
}

let linkSanitizerHookInstalled = false;

function ensureLinkSanitizerHooks(): void {
  if (linkSanitizerHookInstalled || typeof window === 'undefined') return;
  DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
    if (data.attrName !== 'href' || node.nodeName?.toLowerCase() !== 'a') {
      return;
    }
    const safe = sanitizeConstructorLinkHref(data.attrValue);
    if (!safe) {
      data.keepAttr = false;
      return;
    }
    data.attrValue = safe;
  });
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const tag = node.nodeName?.toLowerCase();
    if (tag === 'a') {
      if (node.getAttribute('href')) return;
      const parent = node.parentNode;
      if (!parent) return;
      while (node.firstChild) {
        parent.insertBefore(node.firstChild, node);
      }
      parent.removeChild(node);
      return;
    }
    if (tag === 'span') {
      const dir = node.getAttribute('dir')?.toLowerCase();
      if (dir !== 'ltr' && dir !== 'rtl') node.removeAttribute('dir');
      return;
    }
    if (tag === 'img') {
      const fileId = node.getAttribute('data-file-id')?.trim();
      if (!fileId || node.getAttribute('src')) {
        node.parentNode?.removeChild(node);
        return;
      }
      node.removeAttribute('src');
      return;
    }
    if (tag === 'sup') {
      const footnoteId = node.getAttribute('data-footnote-id')?.trim();
      if (!footnoteId) return;
      node.setAttribute('class', 'folio-footnote-ref');
    }
  });
  linkSanitizerHookInstalled = true;
}

export function sanitizeConstructorTipTapHtml(html: string): string {
  ensureLinkSanitizerHooks();
  const sanitized = DOMPurify.sanitize(html ?? '', {
    ALLOWED_TAGS: [...CONSTRUCTOR_TIPTAP_ALLOWED_TAGS],
    ALLOWED_ATTR: [
      'href',
      'dir',
      'alt',
      'class',
      'data-file-id',
      'data-footnote-id',
    ],
    ALLOW_DATA_ATTR: true,
    ALLOW_ARIA_ATTR: false,
  });
  if (!sanitized || stripHtml(sanitized).length === 0) {
    return '<p></p>';
  }
  return sanitized;
}

export function sanitizeConstructorContent(
  content: ConstructorContent,
): ConstructorContent {
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

let katexSanitizerHooksInstalled = false;

function ensureKatexSanitizerHooks(): void {
  if (katexSanitizerHooksInstalled || typeof window === 'undefined') return;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.nodeName?.toLowerCase() === 'annotation') {
      node.setAttribute('encoding', 'application/x-tex');
    }
  });
  katexSanitizerHooksInstalled = true;
}

export function sanitizeKatexPreviewHtml(html: string): string {
  ensureKatexSanitizerHooks();
  return DOMPurify.sanitize(html ?? '', {
    ALLOWED_TAGS: ['span', 'div', ...KATEX_EXTRA_TAGS],
    ALLOWED_ATTR: ['class', 'aria-hidden', 'encoding', 'xmlns'],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['style', 'script'],
  });
}

export { referenceEntryHasContent };
