import { BadRequestException, Injectable } from '@nestjs/common';
import mammoth from 'mammoth';
import { randomUUID } from 'crypto';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import sanitizeHtml from 'sanitize-html';
import type {
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
  'br',
  'li',
]);

const ABSTRACT_HEADING = /^\s*abstract\s*$/i;
const REFERENCES_HEADING =
  /^\s*(references|bibliography|works\s+cited|literature\s+cited)\s*$/i;
const ACKNOWLEDGMENTS_HEADING = /^\s*acknowledg(e)?ments?\s*$/i;
const FUNDING_HEADING = /^\s*funding(\s+statement)?\s*$/i;
const CONFLICT_HEADING = /^\s*conflict\s+of\s+interest\s*$/i;
const DATA_AVAIL_HEADING = /^\s*data\s+availability\s*$/i;
const KEYWORDS_LABEL = /^\s*keywords?\s*[:：]?\s*/i;
const SMALL_FONT_HINT = /font-size:\s*(?:9|10|11)pt/i;
const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

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
    const warnings = filterDocxImportWarnings(
      mammothResult.messages
        .filter((m) => m.type === 'warning')
        .map((m) => m.message),
    );

    const { sections, warningCodes } = this.htmlToConstructorSections(
      mammothResult.value,
    );
    if (sections.length === 0) {
      throw new BadRequestException({
        message:
          'No recognizable content was found in this Word file. Try a simpler document or build sections manually.',
        code: 'VALIDATION_ERROR',
      });
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
    let pendingBackMatter: RichTextBlockKind | null = null;
    let lastTableIdx = -1;
    const referenceItems: ReferencesSection['items'] = [];

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
    };

    const assignAbstract = (text: string, keywordsLine?: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const lang = textLang(trimmed);
      const keywords = keywordsLine?.replace(KEYWORDS_LABEL, '').trim() ?? '';
      if (lang === 'ar' && !abstractArFilled) {
        abstractArFilled = true;
        sections.push(abstractSection('ar', trimmed, keywords));
      } else if (!abstractEnFilled) {
        abstractEnFilled = true;
        sections.push(abstractSection('en', trimmed, keywords));
      } else if (!abstractArFilled && lang === 'ar') {
        abstractArFilled = true;
        sections.push(abstractSection('ar', trimmed, keywords));
      } else {
        pushParagraph(wrapParagraphHtml(escapeHtml(trimmed)), lang === 'ar' ? 'rtl' : 'ltr');
      }
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
          pendingBackMatter = backKind;
          pendingAbstract = false;
          continue;
        }
      }

      if (tag === 'h1') {
        if (ABSTRACT_HEADING.test(text)) {
          pendingAbstract = true;
          pendingBackMatter = null;
          continue;
        }
        if (REFERENCES_HEADING.test(text)) {
          referencesStarted = true;
          pendingBackMatter = null;
          continue;
        }
        if (!titleEnFilled && !titleArFilled && sections.length === 0) {
          assignTitle(text);
        } else {
          pushHeading(1, text, dir);
        }
        continue;
      }

      if (tag === 'h2' || tag === 'h3') {
        if (ABSTRACT_HEADING.test(text)) {
          pendingAbstract = true;
          pendingBackMatter = null;
          continue;
        }
        if (REFERENCES_HEADING.test(text)) {
          referencesStarted = true;
          pendingBackMatter = null;
          continue;
        }
        pushHeading(tag === 'h2' ? 2 : 3, text, dir);
        continue;
      }

      if (referencesStarted) {
        if (text) {
          referenceItems.push({
            lang: textLang(text) === 'ar' ? 'ar' : 'en',
            text,
          });
        }
        continue;
      }

      if (tag === 'p') {
        if (ABSTRACT_HEADING.test(text)) {
          pendingAbstract = true;
          continue;
        }
        if (REFERENCES_HEADING.test(text)) {
          referencesStarted = true;
          pendingAbstract = false;
          continue;
        }
        const kwMatch = text.match(KEYWORDS_LABEL);
        if (kwMatch && sections.length > 0) {
          const last = sections[sections.length - 1];
          if (last.kind === 'abstract') {
            last.keywords = text.replace(KEYWORDS_LABEL, '').trim();
          }
          pendingAbstract = false;
          continue;
        }
        if (pendingAbstract) {
          assignAbstract(text);
          pendingAbstract = false;
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
        pushParagraph(inner, dir);
        continue;
      }

      if (tag === 'ul' || tag === 'ol') {
        const inner = serializeElement(node);
        pushParagraph(inner, dir);
      }
    }

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
