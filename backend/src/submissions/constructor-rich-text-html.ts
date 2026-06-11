import { parse, type DefaultTreeAdapterMap } from 'parse5';

type Element = DefaultTreeAdapterMap['element'];
type ChildNode = DefaultTreeAdapterMap['childNode'];

const FILE_ID_RE = /data-file-id=["']([^"']+)["']/gi;
const FOOTNOTE_ID_RE = /data-footnote-id=["']([^"']+)["']/gi;

/** Collect inline image file ids from sanitized paragraph HTML. */
export function collectInlineImageFileIdsFromHtml(html: string): string[] {
  const ids = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(FILE_ID_RE.source, 'gi');
  while ((m = re.exec(html)) !== null) {
    if (m[1]) ids.add(m[1]);
  }
  return [...ids];
}

/** Collect footnote ids referenced in paragraph HTML. */
export function collectFootnoteIdsFromHtml(html: string): string[] {
  const ids = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(FOOTNOTE_ID_RE.source, 'gi');
  while ((m = re.exec(html)) !== null) {
    if (m[1]) ids.add(m[1]);
  }
  return [...ids];
}

export function collectReferencedFileIdsFromContentSections(
  sections: { kind: string; fileId?: string | null; html?: string }[],
): Set<string> {
  const ids = new Set<string>();
  for (const s of sections) {
    if (s.kind === 'image' && s.fileId) ids.add(s.fileId);
    if (s.html) {
      for (const id of collectInlineImageFileIdsFromHtml(s.html)) {
        ids.add(id);
      }
    }
    if (s.kind === 'references' && 'items' in s) {
      for (const item of (s as { items: { html?: string }[] }).items) {
        if (item.html) {
          for (const id of collectInlineImageFileIdsFromHtml(item.html)) {
            ids.add(id);
          }
        }
      }
    }
  }
  return ids;
}

function isElement(node: ChildNode): node is Element {
  return 'tagName' in node && node.nodeName !== '#text';
}

function elementAttr(el: Element, name: string): string | undefined {
  return el.attrs?.find((a) => a.name === name)?.value;
}

export type InlineRunDir = 'ltr' | 'rtl' | null;

export function resolveInlineDirFromElement(el: Element): InlineRunDir {
  const dir = elementAttr(el, 'dir')?.toLowerCase();
  if (dir === 'ltr' || dir === 'rtl') return dir;
  return null;
}

export function parseHtmlRoot(html: string): Element {
  const wrapped = `<root>${html}</root>`;
  const doc = parse(wrapped, { sourceCodeLocationInfo: false });
  const root = doc.childNodes.find(
    (n): n is Element => isElement(n) && n.tagName === 'html',
  );
  const body = root?.childNodes.find(
    (n): n is Element => isElement(n) && n.tagName === 'body',
  );
  const inner = body?.childNodes.find(
    (n): n is Element => isElement(n) && n.tagName === 'root',
  );
  return (inner ?? body ?? root ?? doc) as unknown as Element;
}
