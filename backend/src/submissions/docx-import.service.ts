import { BadRequestException, Injectable } from '@nestjs/common';
import mammoth from 'mammoth';
import { randomUUID } from 'crypto';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import sanitizeHtml from 'sanitize-html';
import type {
  ConstructorAuthorEntry,
  ConstructorContent,
  ConstructorDir,
  ConstructorSection,
  ReferencesSection,
  RichTextBlockKind,
  TableSection,
  TitleSection,
} from './constructor-content.types';
import { sniffUploadMime } from './submission-file-upload.policy';
import { filterDocxImportWarnings } from './docx-import-warnings';
import {
  CONSTRUCTOR_IMPORT_BACK_MATTER_UNCERTAIN,
  CONSTRUCTOR_IMPORT_EQUATION_LOST,
  CONSTRUCTOR_IMPORT_MAMMOTH_NOTES,
  CONSTRUCTOR_IMPORT_NO_CONTENT,
  CONSTRUCTOR_IMPORT_TABLE_NOTE_UNCERTAIN,
} from './docx-import-warning-codes';

type Element = DefaultTreeAdapterMap['element'];
type ChildNode = DefaultTreeAdapterMap['childNode'];
type TextNode = DefaultTreeAdapterMap['textNode'];

const BLOCK_TAGS = new Set([
  'h1',
  'h2',
  'h3',
  'p',
  'ul',
  'ol',
  'table',
]);

const INLINE_ALLOWED = new Set([
  'strong',
  'b',
  'em',
  'i',
  'u',
  'sup',
  'sub',
  'a',
  'br',
  'li',
]);

const ABSTRACT_HEADING_EN = /^\s*abstract\s*$/i;
const ABSTRACT_HEADING_AR = /^\s*الملخص\s*$/;
const REFERENCES_HEADING =
  /^\s*(references|bibliography|works\s+cited|literature\s+cited)\s*$/i;
const REFERENCES_HEADING_AR = /^\s*(المراجع|المصادر|قائمة\s+المراجع)\s*$/;
const ACKNOWLEDGMENTS_HEADING = /^\s*acknowledg(e)?ments?\s*$/i;
const FUNDING_HEADING = /^\s*funding(\s+statement)?\s*$/i;
const CONFLICT_HEADING = /^\s*conflict\s+of\s+interest\s*$/i;
const DATA_AVAIL_HEADING = /^\s*data\s+availability\s*$/i;
const KEYWORDS_LABEL_EN = /^\s*keywords?\s*[:：]?\s*/i;
const KEYWORDS_LABEL_AR = /^\s*الكلمات\s+المفتاحية\s*[:：]?\s*/i;
const SMALL_FONT_HINT = /font-size:\s*(?:9|10|11)pt/i;
const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/i;
const TABLE_FIGURE_CAPTION_LINE = /^(?:Table|Figure)\s+\d+\s*:/i;
const MAMMOTH_EQUATION_HINT = /equation|omml|office\s+math/i;

export interface DocxImportResult {
  content: ConstructorContent;
  warnings: string[];
  warningCodes: string[];
}

@Injectable()
export class DocxImportService {
  async importFromBuffer(buffer: Buffer): Promise<DocxImportResult> {
    if (buffer.length < 4) {
      throw new BadRequestException({
        message: 'File is empty or too small',
        code: 'VALIDATION_ERROR',
      });
    }
    const sniff = sniffUploadMime(buffer, '.docx', 'manuscript');
    if (!sniff.ok) {
      throw new BadRequestException({
        message: sniff.reason,
        code: 'VALIDATION_ERROR',
      });
    }

    const mammothResult = await mammoth.convertToHtml({ buffer });
    const rawMammothWarnings = mammothResult.messages
      .filter((m) => m.type === 'warning')
      .map((m) => m.message);
    const warnings = filterDocxImportWarnings(rawMammothWarnings);

    const { sections: rawSections, warningCodes } =
      this.htmlToConstructorSections(mammothResult.value);
    const sections = pruneImportedSections(rawSections);

    if (sections.length === 0) {
      throw new BadRequestException({
        message:
          'No recognizable content was found in this Word file. Try a simpler document or build sections manually.',
        code: CONSTRUCTOR_IMPORT_NO_CONTENT,
      });
    }

    if (
      warnings.length > 0 &&
      !warningCodes.includes(CONSTRUCTOR_IMPORT_MAMMOTH_NOTES)
    ) {
      warningCodes.push(CONSTRUCTOR_IMPORT_MAMMOTH_NOTES);
    }
    if (
      rawMammothWarnings.some((m) => MAMMOTH_EQUATION_HINT.test(m)) &&
      !warningCodes.includes(CONSTRUCTOR_IMPORT_EQUATION_LOST)
    ) {
      warningCodes.push(CONSTRUCTOR_IMPORT_EQUATION_LOST);
    }

    const defaultDir = detectDefaultDir(sections);
    return {
      content: { defaultDir, sections },
      warnings,
      warningCodes,
    };
  }

  private htmlToConstructorSections(html: string): {
    sections: ConstructorSection[];
    warningCodes: string[];
  } {
    const sanitized = sanitizeHtml(html, {
      allowedTags: [
        'h1',
        'h2',
        'h3',
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
        'table',
        'thead',
        'tbody',
        'tr',
        'th',
        'td',
      ],
      allowedAttributes: {},
    });
    const doc = parse(`<body>${sanitized}</body>`, {
      sourceCodeLocationInfo: false,
    }) as DefaultTreeAdapterMap['document'];
    const htmlEl = findChildElement(doc.childNodes, 'html');
    const bodyEl =
      (htmlEl && findChildElement(htmlEl.childNodes, 'body')) ??
      findChildElement(doc.childNodes, 'body') ??
      htmlEl;
    if (!bodyEl) return { sections: [], warningCodes: [] };

    const sections: ConstructorSection[] = [];
    const warningCodes: string[] = [];
    let titleEnFilled = false;
    let titleArFilled = false;
    let abstractEnFilled = false;
    let abstractArFilled = false;
    let referencesStarted = false;
    let pendingAbstract = false;
    let pendingAbstractLang: 'en' | 'ar' | null = null;
    let pendingBackMatter: RichTextBlockKind | null = null;
    let lastTableIdx = -1;
    let inAuthorZone = false;
    let authorZoneClosed = false;
    const authorEntries: ConstructorAuthorEntry[] = [];
    let lastHeadingKey = '';
    let lastParagraphFingerprint = '';
    const referenceItems: ReferencesSection['items'] = [];

    const flushAuthorsSection = () => {
      if (authorEntries.length === 0) return;
      sections.push({
        id: newId(),
        kind: 'authors',
        authors: authorEntries.map((a) => ({ ...a })),
        dir: 'ltr',
        dirSource: 'auto',
      });
      authorEntries.length = 0;
    };

    const closeAuthorZone = () => {
      inAuthorZone = false;
      authorZoneClosed = true;
      flushAuthorsSection();
    };

    const openAuthorZone = () => {
      if (!authorZoneClosed) inAuthorZone = true;
    };

    const startAbstractPending = (headingText: string) => {
      closeAuthorZone();
      pendingAbstract = true;
      pendingAbstractLang = ABSTRACT_HEADING_AR.test(headingText.trim())
        ? 'ar'
        : 'en';
      pendingBackMatter = null;
    };

    const startReferences = () => {
      closeAuthorZone();
      referencesStarted = true;
      pendingAbstract = false;
      pendingAbstractLang = null;
      pendingBackMatter = null;
    };

    const detectBackMatterHeading = (text: string): RichTextBlockKind | null => {
      if (ACKNOWLEDGMENTS_HEADING.test(text)) return 'acknowledgments';
      if (FUNDING_HEADING.test(text)) return 'funding';
      if (CONFLICT_HEADING.test(text)) return 'conflictOfInterest';
      if (DATA_AVAIL_HEADING.test(text)) return 'dataAvailability';
      return null;
    };

    const pushRichTextBlock = (
      kind: RichTextBlockKind,
      innerHtml: string,
      dir: ConstructorDir,
    ) => {
      const trimmed = stripTags(innerHtml).trim();
      if (!trimmed) return;
      sections.push({
        id: newId(),
        kind,
        html: wrapParagraphHtml(innerHtml),
        dir,
        dirSource: 'auto',
      });
    };

    const pushParagraph = (innerHtml: string, dir: ConstructorDir) => {
      const trimmed = stripTags(innerHtml).trim();
      if (!trimmed) return;
      sections.push({
        id: newId(),
        kind: 'paragraph',
        html: wrapParagraphHtml(innerHtml),
        dir,
        dirSource: 'auto',
      });
    };

    const pushHeading = (level: 1 | 2 | 3, text: string, dir: ConstructorDir) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const kind =
        level === 1 ? 'heading1' : level === 2 ? 'heading2' : 'heading3';
      sections.push({
        id: newId(),
        kind,
        text: trimmed,
        dir,
        dirSource: 'auto',
      });
    };

    const assignTitle = (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (sectionTextExists(sections, 'title', trimmed)) return;
      const lang = textLang(trimmed);
      if (lang === 'ar' && !titleArFilled) {
        titleArFilled = true;
        sections.push(titleSection('ar', trimmed));
      } else if (!titleEnFilled) {
        titleEnFilled = true;
        sections.push(titleSection('en', trimmed));
      } else if (!titleArFilled && lang === 'ar') {
        titleArFilled = true;
        sections.push(titleSection('ar', trimmed));
      } else {
        pushHeading(1, trimmed, lang === 'ar' ? 'rtl' : 'ltr');
      }
      openAuthorZone();
    };

    const assignAbstract = (
      text: string,
      preferLang?: 'en' | 'ar',
      keywordsLine?: string,
    ) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const lang = preferLang ?? textLang(trimmed);
      const keywords = keywordsLine
        ? stripKeywordsPrefix(keywordsLine)
        : '';
      if (lang === 'ar' && !abstractArFilled) {
        abstractArFilled = true;
        sections.push(abstractSection('ar', trimmed, keywords));
      } else if (!abstractEnFilled && lang === 'en') {
        abstractEnFilled = true;
        sections.push(abstractSection('en', trimmed, keywords));
      } else if (!abstractArFilled && lang === 'ar') {
        abstractArFilled = true;
        sections.push(abstractSection('ar', trimmed, keywords));
      } else if (!abstractEnFilled) {
        abstractEnFilled = true;
        sections.push(abstractSection('en', trimmed, keywords));
      } else {
        pushParagraph(
          wrapParagraphHtml(escapeHtml(trimmed)),
          lang === 'ar' ? 'rtl' : 'ltr',
        );
      }
    };

    const consumeAuthorLine = (text: string): boolean => {
      if (!looksLikeAuthorMetadata(text)) return false;
      const email = text.match(EMAIL_RE)?.[0] ?? '';
      const parts = text
        .split(/\s*[—–-]\s*/)
        .map((p) => p.trim())
        .filter(Boolean);

      if (email && authorEntries.length > 0) {
        const last = authorEntries[authorEntries.length - 1]!;
        if (!last.email) {
          const affPart = parts.find((p) => !EMAIL_RE.test(p)) ?? '';
          if (affPart) last.affiliation = affPart;
          last.email = email;
          return true;
        }
      }

      if (parts.length >= 2) {
        const first = parts[0]!;
        const second = parts[1]!;
        if (EMAIL_RE.test(second)) {
          const emailAddr = second.match(EMAIL_RE)?.[0] ?? second;
          if (authorEntries.length > 0) {
            const last = authorEntries[authorEntries.length - 1]!;
            if (!last.affiliation) {
              last.affiliation = first.replace(/\*/g, '').trim();
            }
            if (!last.email) last.email = emailAddr;
          } else {
            authorEntries.push({
              fullName: '',
              title: '',
              affiliation: first.replace(/\*/g, '').trim(),
              email: emailAddr,
              isCorresponding: false,
            });
          }
          return true;
        }
        authorEntries.push({
          fullName: first.replace(/\*/g, '').trim(),
          title: second,
          affiliation: '',
          email: '',
          isCorresponding: first.includes('*'),
        });
        return true;
      }

      if (parts.length === 1) {
        authorEntries.push({
          fullName: parts[0]!.replace(/\*/g, '').trim(),
          title: '',
          affiliation: '',
          email: email,
          isCorresponding: parts[0]!.includes('*'),
        });
        return true;
      }

      return false;
    };

    const pushParagraphDeduped = (innerHtml: string, dir: ConstructorDir) => {
      const fingerprint = stripTags(innerHtml).trim();
      if (!fingerprint) return;
      if (fingerprint === lastParagraphFingerprint) return;
      lastParagraphFingerprint = fingerprint;
      pushParagraph(innerHtml, dir);
    };

    for (const node of bodyEl.childNodes) {
      if (!isElement(node)) continue;
      const tag = node.tagName;

      if (tag === 'table') {
        const tableSection = tableFromElement(node);
        if (tableSection) {
          sections.push(tableSection);
          lastTableIdx = sections.length - 1;
        }
        continue;
      }

      if (!BLOCK_TAGS.has(tag)) continue;

      const text = getTextContent(node).trim();
      const dir = textDir(text);

      if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
        const backKind = detectBackMatterHeading(text);
        if (backKind) {
          closeAuthorZone();
          pendingBackMatter = backKind;
          pendingAbstract = false;
          pendingAbstractLang = null;
          continue;
        }

        const level = tag === 'h1' ? 1 : tag === 'h2' ? 2 : 3;
        const headingKey = `${level}:${text}`;
        if (headingKey === lastHeadingKey) continue;
        lastHeadingKey = headingKey;
        lastParagraphFingerprint = '';

        if (isAbstractHeading(text)) {
          startAbstractPending(text);
          continue;
        }
        if (isReferencesHeading(text)) {
          startReferences();
          continue;
        }
      }

      if (tag === 'h1') {
        if (sectionTextExists(sections, 'title', text)) continue;
        if (!titleEnFilled && !titleArFilled && sections.length === 0) {
          assignTitle(text);
        } else if (
          !titleArFilled &&
          textLang(text) === 'ar' &&
          sections.some((s) => s.kind === 'title')
        ) {
          assignTitle(text);
        } else if (!sectionTextExists(sections, 'heading1', text)) {
          pushHeading(1, text, dir);
        }
        continue;
      }

      if (tag === 'h2' || tag === 'h3') {
        const level = tag === 'h2' ? 2 : 3;
        const kind = level === 2 ? 'heading2' : 'heading3';
        if (!sectionTextExists(sections, kind, text)) {
          pushHeading(level, text, dir);
        }
        continue;
      }

      if (referencesStarted) {
        if (tag === 'p') {
          const inner = serializeInnerHtml(node);
          const plain = stripTags(inner);
          if (plain && !shouldSkipReferenceLine(plain)) {
            referenceItems.push({
              lang: textLang(plain) === 'ar' ? 'ar' : 'en',
              html: wrapParagraphHtml(inner),
            });
          }
          continue;
        }
        if (text && !shouldSkipReferenceLine(text)) {
          referenceItems.push({
            lang: textLang(text) === 'ar' ? 'ar' : 'en',
            html: wrapParagraphHtml(escapeHtml(text)),
          });
        }
        continue;
      }

      if (tag === 'p') {
        if (isAbstractHeading(text)) {
          startAbstractPending(text);
          continue;
        }
        if (isReferencesHeading(text)) {
          startReferences();
          continue;
        }
        if (isKeywordsLine(text) && sections.length > 0) {
          const last = sections[sections.length - 1];
          if (last.kind === 'abstract') {
            last.keywords = stripKeywordsPrefix(text);
          }
          pendingAbstract = false;
          pendingAbstractLang = null;
          continue;
        }
        if (pendingAbstract) {
          assignAbstract(text, pendingAbstractLang ?? undefined);
          pendingAbstract = false;
          pendingAbstractLang = null;
          continue;
        }
        if (inAuthorZone && consumeAuthorLine(text)) {
          continue;
        }
        if (inAuthorZone && looksLikeAuthorMetadata(text)) {
          consumeAuthorLine(text);
          continue;
        }
        if (pendingBackMatter) {
          const inner = serializeInnerHtml(node);
          pushRichTextBlock(pendingBackMatter, inner, dir);
          pendingBackMatter = null;
          continue;
        }
        const inner = serializeInnerHtml(node);
        const rawHtml = node as Element & { attrs?: { style?: string }[] };
        const styleAttr = rawHtml.attrs?.find((a) => a.name === 'style')?.value ?? '';
        if (
          lastTableIdx >= 0 &&
          text.length > 0 &&
          text.length < 600 &&
          (SMALL_FONT_HINT.test(styleAttr) || text.length < 200)
        ) {
          const table = sections[lastTableIdx] as TableSection;
          if (!table.notes?.trim()) {
            table.notes = text;
            lastTableIdx = -1;
            continue;
          }
          if (!warningCodes.includes(CONSTRUCTOR_IMPORT_TABLE_NOTE_UNCERTAIN)) {
            warningCodes.push(CONSTRUCTOR_IMPORT_TABLE_NOTE_UNCERTAIN);
          }
        }
        if (/^Table\s+\d+\s*:?\s*$/i.test(text)) {
          continue;
        }
        pushParagraphDeduped(inner, dir);
        continue;
      }

      if (tag === 'ul' || tag === 'ol') {
        const inner = serializeElement(node);
        pushParagraphDeduped(inner, dir);
      }
    }

    closeAuthorZone();

    if (referenceItems.length > 0) {
      sections.push({
        id: newId(),
        kind: 'references',
        items: referenceItems,
        dir: 'ltr',
        dirSource: 'auto',
      });
    }

    if (pendingBackMatter) {
      if (!warningCodes.includes(CONSTRUCTOR_IMPORT_BACK_MATTER_UNCERTAIN)) {
        warningCodes.push(CONSTRUCTOR_IMPORT_BACK_MATTER_UNCERTAIN);
      }
    }

    return { sections, warningCodes };
  }
}

function newId(): string {
  return randomUUID();
}

function titleSection(lang: 'en' | 'ar', text: string): TitleSection {
  return {
    id: newId(),
    kind: 'title',
    lang,
    text,
    dir: lang === 'ar' ? 'rtl' : 'ltr',
    dirSource: 'auto',
  };
}

function abstractSection(
  lang: 'en' | 'ar',
  text: string,
  keywords: string,
): ConstructorSection {
  return {
    id: newId(),
    kind: 'abstract',
    lang,
    text,
    keywords,
    dir: lang === 'ar' ? 'rtl' : 'ltr',
    dirSource: 'auto',
  };
}

function tableFromElement(el: Element): ConstructorSection | null {
  const rows: string[][] = [];
  for (const child of el.childNodes) {
    if (!isElement(child)) continue;
    if (child.tagName === 'tr') {
      rows.push(rowCells(child));
    } else if (child.tagName === 'thead' || child.tagName === 'tbody') {
      for (const tr of child.childNodes) {
        if (isElement(tr) && tr.tagName === 'tr') rows.push(rowCells(tr));
      }
    }
  }
  if (rows.length === 0) return null;
  return {
    id: newId(),
    kind: 'table',
    caption: '',
    hasHeaderRow: true,
    rows,
    dir: 'ltr',
    dirSource: 'auto',
  };
}

function rowCells(tr: Element): string[] {
  const cells: string[] = [];
  for (const c of tr.childNodes) {
    if (isElement(c) && (c.tagName === 'td' || c.tagName === 'th')) {
      cells.push(getTextContent(c).trim());
    }
  }
  return cells;
}

function isElement(node: ChildNode): node is Element {
  return 'tagName' in node && node.nodeName !== '#text';
}

function findChildElement(
  nodes: ChildNode[],
  tagName: string,
): Element | null {
  for (const c of nodes) {
    if (isElement(c) && c.tagName === tagName) return c;
  }
  return null;
}

function getTextContent(el: Element): string {
  let out = '';
  for (const c of el.childNodes) {
    if (c.nodeName === '#text') out += (c as TextNode).value;
    else if (isElement(c)) out += getTextContent(c);
  }
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function wrapParagraphHtml(inner: string): string {
  const trimmed = inner.trim();
  if (!trimmed) return '<p></p>';
  if (trimmed.startsWith('<p>')) return trimmed;
  return `<p>${trimmed}</p>`;
}

function serializeInnerHtml(el: Element): string {
  const parts: string[] = [];
  for (const c of el.childNodes) {
    if (c.nodeName === '#text') parts.push(escapeHtml((c as TextNode).value));
    else if (isElement(c)) parts.push(serializeElement(c));
  }
  return parts.join('');
}

function serializeElement(el: Element): string {
  const tag = el.tagName;
  if (tag === 'br') return '<br>';
  const inner = serializeInnerHtml(el);
  if (tag === 'p') return wrapParagraphHtml(inner);
  if (tag === 'a') {
    const href = el.attrs?.find((a) => a.name === 'href')?.value;
    if (href) {
      return `<a href="${escapeHtml(href)}">${inner}</a>`;
    }
    return inner;
  }
  if (INLINE_ALLOWED.has(tag) || tag === 'ul' || tag === 'ol') {
    return `<${tag}>${inner}</${tag}>`;
  }
  return inner;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

function textLang(text: string): 'en' | 'ar' {
  const ar = (text.match(ARABIC_RE) ?? []).length;
  const lat = (text.match(/[A-Za-z]/g) ?? []).length;
  return ar > lat ? 'ar' : 'en';
}

function textDir(text: string): ConstructorDir {
  return textLang(text) === 'ar' ? 'rtl' : 'ltr';
}

function detectDefaultDir(sections: ConstructorSection[]): ConstructorDir {
  for (const s of sections) {
    if (s.kind === 'title' && (s as TitleSection).lang === 'ar') return 'rtl';
    if (s.kind === 'paragraph' && s.dir === 'rtl') return 'rtl';
  }
  return 'ltr';
}

function isAbstractHeading(text: string): boolean {
  const t = text.trim();
  return ABSTRACT_HEADING_EN.test(t) || ABSTRACT_HEADING_AR.test(t);
}

function isReferencesHeading(text: string): boolean {
  const t = text.trim();
  return REFERENCES_HEADING.test(t) || REFERENCES_HEADING_AR.test(t);
}

function isKeywordsLine(text: string): boolean {
  return KEYWORDS_LABEL_EN.test(text) || KEYWORDS_LABEL_AR.test(text);
}

function stripKeywordsPrefix(text: string): string {
  return text
    .replace(KEYWORDS_LABEL_EN, '')
    .replace(KEYWORDS_LABEL_AR, '')
    .trim();
}

function shouldSkipReferenceLine(text: string): boolean {
  return TABLE_FIGURE_CAPTION_LINE.test(text.trim());
}

function looksLikeAuthorMetadata(text: string): boolean {
  return (
    EMAIL_RE.test(text) ||
    /[—–]/.test(text) ||
    /\*/.test(text) ||
    /^\s*(Dr|Prof|Mr|Mrs|Ms|د\.)/i.test(text)
  );
}

function sectionTextExists(
  sections: ConstructorSection[],
  kind: ConstructorSection['kind'],
  text: string,
): boolean {
  const t = text.trim();
  return sections.some((s) => {
    if (s.kind !== kind) return false;
    if ('text' in s && typeof (s as { text?: string }).text === 'string') {
      return (s as { text: string }).text.trim() === t;
    }
    return false;
  });
}

function sectionHasImportContent(s: ConstructorSection): boolean {
  switch (s.kind) {
    case 'title':
    case 'heading1':
    case 'heading2':
    case 'heading3':
      return s.text.trim().length > 0;
    case 'abstract':
      return s.text.trim().length > 0 || s.keywords.trim().length > 0;
    case 'paragraph':
    case 'acknowledgments':
    case 'funding':
    case 'conflictOfInterest':
    case 'dataAvailability':
      return stripTags(s.html).trim().length > 0;
    case 'authors':
      return s.authors.some(
        (a) =>
          a.fullName.trim().length > 0 ||
          a.email.trim().length > 0 ||
          a.affiliation.trim().length > 0,
      );
    case 'references':
      return s.items.some(
        (i) =>
          (i.html && stripTags(i.html).trim().length > 0) ||
          (i.text?.trim().length ?? 0) > 0,
      );
    case 'table':
      return (
        s.rows.some((row) => row.some((c) => c.trim().length > 0)) ||
        (s.notes?.trim().length ?? 0) > 0 ||
        s.caption.trim().length > 0
      );
    case 'image':
      return Boolean(s.fileId) || s.caption.trim().length > 0;
    case 'equation':
      return s.latex.trim().length > 0;
    default:
      return true;
  }
}

function pruneImportedSections(
  sections: ConstructorSection[],
): ConstructorSection[] {
  return sections.filter(sectionHasImportContent);
}
