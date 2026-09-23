import { Injectable } from '@nestjs/common';
import JSZip from 'jszip';
import {
  AlignmentType,
  BorderStyle,
  Document,
  EndnoteReferenceRun,
  ExternalHyperlink,
  Footer,
  FootnoteReferenceRun,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  LineNumberRestartFormat,
  Packer,
  PageBreak,
  PageNumber,
  PageOrientation,
  Paragraph,
  Table,
  TableAnchorType,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlignTable,
  WidthType,
  convertMillimetersToTwip,
  type IBorderOptions,
  type IPropertiesOptions,
  type IRunOptions,
  type ISectionOptions,
  type ParagraphChild,
} from 'docx';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import {
  referenceEntryHasContent,
  referenceEntrySortKey,
  resolveReferenceEntryHtml,
  sanitizeConstructorLinkHref,
} from './constructor-rich-text';
import { sanitizeConstructorTipTapHtml } from './sanitize-constructor-html';
import type {
  ManuscriptAlignment,
  ManuscriptStyleProfile,
} from '../manuscript-styles/manuscript-style.types';
import {
  resolveCitationStyle,
  type CitationStyle,
} from '../manuscript-styles/citation-style';
import {
  CC_BY_NC_SA_BADGE_PNG,
  CC_BY_NC_SA_BADGE_SIZE_PX,
} from '../manuscript-styles/assets/cc-by-nc-sa-badge';
import type {
  AbstractSection,
  AuthorsSection,
  ConstructorContent,
  ConstructorDir,
  ConstructorFootnote,
  ConstructorReferenceEntry,
  EquationSection,
  HeadingSection,
  ImageSection,
  ParagraphSection,
  ReferencesSection,
  RichTextBlockSection,
  TableSection,
  TitleSection,
} from './constructor-content.types';
import { resolveSectionDir } from './constructor-content.types';
import { collectFootnoteIdsFromHtml } from './constructor-rich-text-html';
import {
  getTableCellText,
  isTableCellCovered,
  normalizeTableRows,
} from './constructor-table-utils';
import { EquationOmmlService } from './equation-omml.service';

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];
type TextNode = DefaultTreeAdapterMap['textNode'];
type Block = Paragraph | Table;
type Lang = 'ar' | 'en';

/**
 * Inline marks that can be combined on a single TextRun.
 * Defense-in-depth — TipTap is restricted to these marks at the editor level.
 */
type InlineMarks = {
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  superScript?: boolean;
  subScript?: boolean;
  runDir?: ConstructorDir;
  /** Override the body font size (half-points) for both scripts. */
  sizeOverride?: number;
};

type ImageResolver = (
  fileId: string,
) => Promise<{ data: Buffer; mime: string } | null>;

type DocxBuildContext = {
  imageResolver: ImageResolver;
  footnoteNumById: Map<string, number>;
  endnoteNumById: Map<string, number>;
  footnotesById: Map<string, ConstructorFootnote>;
};

/** Journal the manuscript is submitted to; fills the first-page header and footer. */
export interface DocxJournalContext {
  titleAr?: string | null;
  titleEn?: string | null;
  /** Online ISSN, printed in the first-page footer when known. */
  eissn?: string | null;
  /** Picks the reference-list order via `profile.references.citationStyles`. */
  disciplineLabel?: string | null;
}

export interface DocxGenerateOptions {
  journal?: DocxJournalContext | null;
}

/** Title, authors and abstracts laid out as the template's first two pages. */
interface FrontMatter {
  titles: Partial<Record<Lang, TitleSection>>;
  authors?: AuthorsSection;
  abstracts: Partial<Record<Lang, AbstractSection>>;
  sectionIds: Set<string>;
}

const REFERENCES_NUMBERING = 'constructor-references';
const PAGE_WIDTH_TWIPS = 11906;

/** APA list order: alphabetical within each language, one language block first. */
function sortReferencesApa(
  items: ConstructorReferenceEntry[],
  arabicFirst: boolean,
): ConstructorReferenceEntry[] {
  const byLang = (lang: Lang) =>
    items
      .filter((i) => i.lang === lang)
      .sort((a, b) =>
        referenceEntrySortKey(a).localeCompare(referenceEntrySortKey(b), lang),
      );
  return arabicFirst
    ? [...byLang('ar'), ...byLang('en')]
    : [...byLang('en'), ...byLang('ar')];
}

const NO_BORDER: IBorderOptions = {
  style: BorderStyle.NONE,
  size: 0,
  color: 'auto',
};
const NO_TABLE_BORDERS = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
  insideHorizontal: NO_BORDER,
  insideVertical: NO_BORDER,
};
const RULE_BORDER: IBorderOptions = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: '000000',
};
const HEAVY_RULE_BORDER: IBorderOptions = {
  style: BorderStyle.SINGLE,
  size: 12,
  color: '000000',
};

const ARABIC_SCRIPT = /\p{Script=Arabic}/u;
const LATIN_SCRIPT = /\p{Script=Latin}/u;

export interface ScriptSegment {
  text: string;
  rtl: boolean;
}

/**
 * Splits text so each script gets its own run: Word sizes a run marked `rtl`
 * with the complex-script size for every character, so a Latin word left inside
 * an Arabic run would print in Simplified Arabic 12 instead of Times New Roman
 * 11. Neutral characters (spaces, digits, punctuation) stay with the script on
 * both sides of them, or take the paragraph direction between two different
 * scripts — the Unicode bidi rule for neutrals.
 */
export function splitTextByScript(
  text: string,
  paragraphRtl: boolean,
): ScriptSegment[] {
  const segments: ScriptSegment[] = [];
  const append = (t: string, rtl: boolean) => {
    if (!t) return;
    const last = segments[segments.length - 1];
    if (last && last.rtl === rtl) last.text += t;
    else segments.push({ text: t, rtl });
  };
  let previous: boolean | null = null;
  let neutral = '';
  for (const ch of text) {
    const strong = ARABIC_SCRIPT.test(ch)
      ? true
      : LATIN_SCRIPT.test(ch)
        ? false
        : null;
    if (strong === null) {
      neutral += ch;
      continue;
    }
    const before = previous ?? paragraphRtl;
    append(neutral, before === strong ? strong : paragraphRtl);
    append(ch, strong);
    neutral = '';
    previous = strong;
  }
  // Trailing neutrals sit between the last script and the paragraph end.
  append(neutral, paragraphRtl);
  return segments;
}

const NAME_PARTICLES = new Set([
  'عبد',
  'أبو',
  'ابو',
  'أبي',
  'ابن',
  'بن',
  'آل',
  'al',
  'el',
  'abu',
  'abd',
  'bin',
  'ibn',
  'de',
  'da',
  'di',
  'del',
  'van',
  'von',
  'der',
  'le',
  'la',
]);

/**
 * Surname ("الكنية") for the running header. The template asks for first name
 * then surname, so everything after the first word is the surname once
 * compound-surname particles (عبد، أبو، van…) are kept with it.
 */
export function authorSurname(fullName: string): string {
  const words = fullName
    .replace(/\*/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length <= 1) return words[0] ?? '';
  let start = words.length - 1;
  while (start > 1 && NAME_PARTICLES.has(words[start - 1].toLowerCase())) {
    start -= 1;
  }
  return words.slice(start).join(' ');
}

function toAlignmentType(a: ManuscriptAlignment) {
  switch (a) {
    case 'center':
      return AlignmentType.CENTER;
    case 'right':
      return AlignmentType.RIGHT;
    default:
      return AlignmentType.LEFT;
  }
}

function hasLetters(text: string | undefined): boolean {
  return Boolean(text && /\p{L}/u.test(text));
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ');
}

/**
 * The article's language decides the front-matter order, running header and
 * line-number side. Judged on the body text so a draft left on the old
 * left-to-right default still lays out as the Arabic article it is.
 */
function detectArticleDir(content: ConstructorContent): ConstructorDir {
  let arabic = 0;
  let latin = 0;
  for (const s of content.sections) {
    const text =
      s.kind === 'heading1' || s.kind === 'heading2' || s.kind === 'heading3'
        ? s.text
        : 'html' in s
          ? stripTags(s.html ?? '')
          : '';
    arabic += (text.match(/\p{Script=Arabic}/gu) ?? []).length;
    latin += (text.match(/\p{Script=Latin}/gu) ?? []).length;
  }
  if (arabic === 0 && latin === 0) return content.defaultDir;
  return arabic >= latin ? 'rtl' : 'ltr';
}

/**
 * Word draws line numbers on the right only for right-to-left sections, so an
 * English article gets `<w:bidi/>` on its section. The docx library exposes no
 * section direction, hence the patch.
 */
async function markSectionsRightToLeft(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const file = zip.file('word/document.xml');
  if (!file) return buffer;
  const xml = await file.async('string');
  const patched = xml.replace(
    /<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>/g,
    (sect) => {
      if (/<w:bidi\b/.test(sect)) return sect;
      // CT_SectPr order: … titlePg, textDirection, bidi, rtlGutter, docGrid …
      if (/<w:docGrid\b/.test(sect)) {
        return sect.replace(/<w:docGrid\b/, '<w:bidi/><w:docGrid');
      }
      return sect.replace('</w:sectPr>', '<w:bidi/></w:sectPr>');
    },
  );
  zip.file('word/document.xml', patched);
  return zip.generateAsync({ type: 'nodebuffer' });
}

@Injectable()
export class DocxGeneratorService {
  constructor(private readonly equationOmml: EquationOmmlService) {}

  /**
   * Builds a `.docx` Buffer from a ConstructorContent payload.
   *
   * Caller responsibilities:
   *  - Resolve image bytes for any `ImageSection.fileId` and pass via `imageResolver`.
   *  - Supply the resolved {@link ManuscriptStyleProfile} for layout (fonts, margins, etc.).
   */
  async generate(
    content: ConstructorContent,
    imageResolver: ImageResolver,
    profile: ManuscriptStyleProfile,
    options: DocxGenerateOptions = {},
  ): Promise<Buffer> {
    const defaultDir = content.defaultDir;
    const articleDir = detectArticleDir(content);
    const ctx = this.buildDocxContext(content, imageResolver);
    const frontMatter = profile.frontMatter?.bilingualPages
      ? this.collectFrontMatter(content)
      : null;

    const children: Block[] = [];
    if (frontMatter) {
      children.push(...this.buildFrontMatter(frontMatter, articleDir, profile));
    }

    let figureCounter = 0;
    let tableCounter = 0;
    let equationCounter = 0;
    const bodyStart = children.length;

    for (const section of content.sections) {
      if (frontMatter?.sectionIds.has(section.id)) continue;
      const dir = resolveSectionDir(section, defaultDir);
      switch (section.kind) {
        case 'title':
          children.push(this.buildTitle(section, dir, profile));
          break;
        case 'authors':
          children.push(...this.buildAuthors(section, dir, profile));
          break;
        case 'abstract':
          children.push(...this.buildAbstract(section, profile));
          break;
        case 'heading1':
        case 'heading2':
        case 'heading3':
          if (profile.blankLineBeforeHeadings && children.length > bodyStart) {
            children.push(this.blankParagraph(dir));
          }
          children.push(this.buildHeading(section, dir, profile));
          break;
        case 'paragraph':
          children.push(
            ...(await this.buildParagraph(section, dir, profile, ctx)),
          );
          break;
        case 'image': {
          figureCounter += 1;
          children.push(
            ...(await this.buildImage(
              section,
              dir,
              figureCounter,
              imageResolver,
              profile,
            )),
          );
          break;
        }
        case 'table': {
          tableCounter += 1;
          children.push(
            ...this.buildTable(section, dir, tableCounter, profile),
          );
          break;
        }
        case 'acknowledgments':
        case 'funding':
        case 'conflictOfInterest':
        case 'dataAvailability':
          children.push(
            ...(await this.buildRichTextBlock(section, dir, profile, ctx)),
          );
          break;
        case 'equation': {
          equationCounter += 1;
          children.push(
            ...(await this.buildEquation(
              section,
              dir,
              equationCounter,
              profile,
            )),
          );
          break;
        }
        case 'references':
          if (profile.blankLineBeforeHeadings && children.length > bodyStart) {
            children.push(this.blankParagraph(articleDir));
          }
          children.push(
            ...(await this.buildReferences(
              section,
              articleDir,
              profile,
              ctx,
              resolveCitationStyle(profile, options.journal?.disciplineLabel),
            )),
          );
          break;
      }
    }

    const mm = profile.pageMarginsMm;
    const noteParts = this.buildDocxFootnoteParts(ctx, profile, articleDir);
    const section: ISectionOptions = {
      properties: {
        page: {
          size: { orientation: PageOrientation.PORTRAIT },
          margin: {
            top: convertMillimetersToTwip(mm.top),
            bottom: convertMillimetersToTwip(mm.bottom),
            left: convertMillimetersToTwip(mm.left),
            right: convertMillimetersToTwip(mm.right),
            header: convertMillimetersToTwip(mm.header),
            footer: convertMillimetersToTwip(mm.footer),
          },
        },
        titlePage: true,
        ...(profile.lineNumbers
          ? {
              lineNumbers: {
                countBy: 1,
                restart: LineNumberRestartFormat.CONTINUOUS,
                distance: 255,
              },
            }
          : {}),
      },
      ...this.buildPageFurniture(
        content,
        frontMatter,
        articleDir,
        profile,
        options.journal ?? null,
      ),
      children,
    };

    const doc = new Document({
      styles: this.buildStyles(profile),
      numbering: this.buildNumbering(profile),
      ...noteParts,
      sections: [section],
    });

    const buffer = await Packer.toBuffer(doc);
    return profile.lineNumbers && articleDir === 'ltr'
      ? markSectionsRightToLeft(buffer)
      : buffer;
  }

  private buildStyles(profile: ManuscriptStyleProfile) {
    const f = profile.fonts;
    const s = profile.sizesHalfPoints;
    const h = profile.headingParagraphSpacing;
    const docSpacing = profile.documentParagraphSpacing;
    const heading = (
      size: number,
      spacing: { before: number; after: number },
    ) => ({
      run: {
        bold: true,
        size,
        sizeComplexScript: size,
        font: { ascii: f.latin, hAnsi: f.latin, cs: f.arabic },
        color: '000000',
      },
      paragraph: {
        spacing: {
          before: spacing.before,
          after: spacing.after,
          line: profile.documentLineSpacingTwips,
        },
        keepNext: true,
      },
    });
    return {
      default: {
        document: {
          run: {
            font: { ascii: f.latin, hAnsi: f.latin, cs: f.arabic },
            size: s.bodyLatin,
            sizeComplexScript: s.bodyArabic,
          },
          paragraph: {
            spacing: {
              line: profile.documentLineSpacingTwips,
              before: docSpacing.before,
              after: docSpacing.after,
            },
          },
        },
        title: heading(s.title, { before: 0, after: 0 }),
        heading1: heading(s.heading1, h.heading1),
        heading2: heading(s.heading2, h.heading2),
        heading3: heading(s.heading3, h.heading3),
      },
      paragraphStyles: profile.paragraphStyles.map((ps) => ({
        id: ps.id,
        name: ps.name,
        basedOn: ps.basedOn,
        next: ps.next,
        run: {
          bold: ps.run.bold,
          size: ps.run.sizeHalfPoints,
          sizeComplexScript: ps.run.sizeHalfPoints,
        },
        paragraph: {
          alignment: toAlignmentType(ps.paragraph.alignment),
          spacing: {
            before: ps.paragraph.spacingBefore,
            after: ps.paragraph.spacingAfter,
          },
        },
      })),
    };
  }

  private buildNumbering(profile: ManuscriptStyleProfile) {
    const decimal = (reference: string) => ({
      reference,
      levels: [
        {
          level: 0,
          format: LevelFormat.DECIMAL,
          text: '%1.',
          alignment: AlignmentType.LEFT,
          style: {
            paragraph: { indent: { left: 720, hanging: 360 } },
          },
        },
      ],
    });
    return {
      config: [
        {
          reference: profile.numbering.bulletReference,
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 720, hanging: 360 } },
              },
            },
          ],
        },
        decimal(profile.numbering.decimalReference),
        // Its own list so reference numbers never continue a body list.
        decimal(REFERENCES_NUMBERING),
      ],
    };
  }

  private figureCaptionStyleId(profile: ManuscriptStyleProfile): string {
    const fig = profile.paragraphStyles.find((p) =>
      p.id.toLowerCase().includes('figure'),
    );
    return fig?.id ?? 'FigureCaption';
  }

  private tableNoteStyleId(profile: ManuscriptStyleProfile): string {
    const found = profile.paragraphStyles.find((s) => s.id === 'TableNote');
    return found?.id ?? 'Normal';
  }

  private tableCaptionStyleId(profile: ManuscriptStyleProfile): string {
    const t = profile.paragraphStyles.find(
      (p) =>
        p.id === 'TableCaption' ||
        p.name.toLowerCase().includes('table caption'),
    );
    return t?.id ?? 'TableCaption';
  }

  /** "الجدول (1) caption" or "Table 1: caption", in the caption's direction. */
  private captionText(
    kind: 'figure' | 'table',
    num: number,
    caption: string,
    dir: ConstructorDir,
    profile: ManuscriptStyleProfile,
  ): string {
    const c = profile.captions;
    const word =
      kind === 'figure'
        ? dir === 'ltr'
          ? (c.figureWordLtr ?? c.figureWord)
          : c.figureWord
        : dir === 'ltr'
          ? (c.tableWordLtr ?? c.tableWord)
          : c.tableWord;
    const text = caption.trim();
    if (c.numberFormat === 'parenthesized') {
      return text ? `${word} (${num}) ${text}` : `${word} (${num})`;
    }
    return `${word} ${num}: ${text}`;
  }

  private blankParagraph(dir: ConstructorDir): Paragraph {
    return new Paragraph({
      bidirectional: dir === 'rtl',
      children: [],
    });
  }

  // ── Front matter ────────────────────────────────────────────────────────────

  private collectFrontMatter(content: ConstructorContent): FrontMatter {
    const fm: FrontMatter = {
      titles: {},
      abstracts: {},
      sectionIds: new Set(),
    };
    for (const s of content.sections) {
      if (s.kind === 'title') {
        const lang: Lang = s.lang === 'ar' ? 'ar' : 'en';
        if (!fm.titles[lang]) {
          fm.titles[lang] = s;
          fm.sectionIds.add(s.id);
        }
      } else if (s.kind === 'authors' && !fm.authors) {
        fm.authors = s;
        fm.sectionIds.add(s.id);
      } else if (s.kind === 'abstract' && !fm.abstracts[s.lang]) {
        fm.abstracts[s.lang] = s;
        fm.sectionIds.add(s.id);
      }
    }
    return fm;
  }

  /**
   * Page 1: article-language title, authors, affiliations, abstract, keywords
   * and the dates/licence box. Page 2: the same in the other language. The
   * body starts on page 3, as in the template.
   */
  private buildFrontMatter(
    fm: FrontMatter,
    articleDir: ConstructorDir,
    profile: ManuscriptStyleProfile,
  ): Block[] {
    const primary: Lang = articleDir === 'rtl' ? 'ar' : 'en';
    const secondary: Lang = primary === 'ar' ? 'en' : 'ar';
    const out: Block[] = [];
    for (const lang of [primary, secondary]) {
      const title = fm.titles[lang];
      const abstract = fm.abstracts[lang];
      if (!hasLetters(title?.text) && !hasLetters(abstract?.text)) continue;
      if (out.length > 0)
        out.push(new Paragraph({ children: [new PageBreak()] }));
      out.push(
        ...this.buildLanguageBlock(lang, title, fm.authors, abstract, profile),
      );
    }
    if (out.length > 0)
      out.push(new Paragraph({ children: [new PageBreak()] }));
    return out;
  }

  private buildLanguageBlock(
    lang: Lang,
    title: TitleSection | undefined,
    authors: AuthorsSection | undefined,
    abstract: AbstractSection | undefined,
    profile: ManuscriptStyleProfile,
  ): Block[] {
    const fmLayout = profile.frontMatter!;
    const dir: ConstructorDir = lang === 'ar' ? 'rtl' : 'ltr';
    const rtl = dir === 'rtl';
    const indent = { left: fmLayout.sideColumnIndentTwips };
    const s = profile.sizesHalfPoints;
    const out: Block[] = [];

    if (title && hasLetters(title.text)) {
      out.push(
        new Paragraph({
          heading: HeadingLevel.TITLE,
          bidirectional: rtl,
          alignment: AlignmentType.BOTH,
          children: this.runs(title.text, dir, profile, {
            bold: true,
            sizeOverride: s.title,
          }),
        }),
      );
    }

    const people = (authors?.authors ?? []).filter((a) =>
      hasLetters(a.fullName),
    );
    if (people.length > 0) {
      const separator = rtl ? '، ' : ', ';
      const names: ParagraphChild[] = [];
      people.forEach((a, i) => {
        const label = [a.title?.trim(), a.fullName.trim()]
          .filter(Boolean)
          .join(' ');
        names.push(...this.runs(label, dir, profile));
        names.push(
          this.run(`${i + 1}${a.isCorresponding ? '*' : ''}`, dir, profile, {
            superScript: true,
          }),
        );
        if (i < people.length - 1)
          names.push(...this.runs(separator, dir, profile));
      });
      out.push(
        new Paragraph({
          bidirectional: rtl,
          alignment: AlignmentType.BOTH,
          indent,
          children: names,
        }),
      );
      people.forEach((a, i) => {
        const line = [a.affiliation, a.specialization, a.email]
          .map((part) => part?.trim())
          .filter(Boolean)
          .join(separator);
        out.push(
          new Paragraph({
            bidirectional: rtl,
            alignment: AlignmentType.BOTH,
            indent,
            children: [
              this.run(`${i + 1}`, dir, profile, { superScript: true }),
              ...this.runs(line ? ` ${line}` : '', dir, profile),
            ],
          }),
        );
      });
    }

    out.push(this.blankParagraph(dir));
    out.push(this.buildSideBox(lang, profile));
    out.push(
      new Paragraph({
        bidirectional: rtl,
        alignment: AlignmentType.BOTH,
        indent,
        keepNext: true,
        children: this.runs(rtl ? 'الملخص:' : 'Abstract:', dir, profile, {
          bold: true,
          sizeOverride: s.heading1,
        }),
      }),
    );
    out.push(
      new Paragraph({
        bidirectional: rtl,
        alignment: AlignmentType.BOTH,
        indent,
        children: this.runs(abstract?.text ?? '', dir, profile),
      }),
    );
    if (abstract?.keywords?.trim()) {
      out.push(this.blankParagraph(dir));
      out.push(
        new Paragraph({
          bidirectional: rtl,
          alignment: AlignmentType.BOTH,
          indent,
          children: [
            ...this.runs(
              rtl ? 'الكلمات المفتاحية: ' : 'Keywords: ',
              dir,
              profile,
              {
                bold: true,
              },
            ),
            ...this.runs(abstract.keywords.trim(), dir, profile),
          ],
        }),
      );
    }
    return out;
  }

  /** Dates and CC BY-NC-SA licence, floated on the block's start side. */
  private buildSideBox(lang: Lang, profile: ManuscriptStyleProfile): Table {
    const box = profile.frontMatter!.sideBox;
    const labels = box[lang];
    const dir: ConstructorDir = lang === 'ar' ? 'rtl' : 'ltr';
    const rtl = dir === 'rtl';
    const para = (
      children: ParagraphChild[],
      alignment: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.BOTH,
    ) => new Paragraph({ bidirectional: rtl, alignment, children });
    const x = rtl
      ? PAGE_WIDTH_TWIPS - box.pageEdgeOffsetTwips - box.widthTwips
      : box.pageEdgeOffsetTwips;
    return new Table({
      width: { size: box.widthTwips, type: WidthType.DXA },
      columnWidths: [box.widthTwips],
      layout: TableLayoutType.FIXED,
      borders: NO_TABLE_BORDERS,
      visuallyRightToLeft: rtl,
      float: {
        horizontalAnchor: TableAnchorType.PAGE,
        absoluteHorizontalPosition: x,
        verticalAnchor: TableAnchorType.TEXT,
        absoluteVerticalPosition: 0,
        leftFromText: 198,
        rightFromText: 198,
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: box.widthTwips, type: WidthType.DXA },
              borders: NO_TABLE_BORDERS,
              children: [
                para(this.runs(labels.received, dir, profile, { bold: true })),
                para(this.runs(labels.accepted, dir, profile, { bold: true })),
                para(
                  [
                    new ImageRun({
                      type: 'png',
                      data: CC_BY_NC_SA_BADGE_PNG,
                      transformation: CC_BY_NC_SA_BADGE_SIZE_PX,
                      altText: {
                        title: 'CC BY-NC-SA',
                        description: 'Creative Commons BY-NC-SA licence',
                        name: 'cc-by-nc-sa',
                      },
                    }),
                  ],
                  AlignmentType.CENTER,
                ),
                para([
                  ...this.runs(`${labels.copyrightLabel} `, dir, profile, {
                    bold: true,
                  }),
                  ...this.runs(labels.copyright, dir, profile),
                ]),
              ],
            }),
          ],
        }),
      ],
    });
  }

  // ── Headers and footers ─────────────────────────────────────────────────────

  private buildPageFurniture(
    content: ConstructorContent,
    frontMatter: FrontMatter | null,
    articleDir: ConstructorDir,
    profile: ManuscriptStyleProfile,
    journal: DocxJournalContext | null,
  ): Pick<ISectionOptions, 'headers' | 'footers'> {
    const pf = profile.pageFurniture;
    if (!pf) return {};
    const rtl = articleDir === 'rtl';
    const size = pf.sizeHalfPoints;
    const fh = pf.firstPageHeader;
    const fullWidth = { size: 100, type: WidthType.PERCENTAGE } as const;
    const cell = (children: Paragraph[], widthPct: number) =>
      new TableCell({
        width: { size: widthPct, type: WidthType.PERCENTAGE },
        borders: NO_TABLE_BORDERS,
        verticalAlign: VerticalAlignTable.CENTER,
        children,
      });
    const ruled = (edge: 'top' | 'bottom') =>
      new Paragraph({
        border: { [edge]: { ...RULE_BORDER, space: 1 } },
        children: [],
      });
    const line = (
      text: string,
      dir: ConstructorDir,
      marks: InlineMarks,
      alignment: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.BOTH,
    ) =>
      new Paragraph({
        bidirectional: dir === 'rtl',
        alignment,
        children: this.runs(text, dir, profile, marks),
      });

    // Page 1 header: English journal name on the left, Arabic on the right.
    const firstMarks = { bold: true, sizeOverride: fh.sizeHalfPoints };
    const firstHeader = new Header({
      children: [
        new Table({
          width: fullWidth,
          borders: NO_TABLE_BORDERS,
          rows: [
            new TableRow({
              children: [
                cell(
                  [
                    line(
                      journal?.titleEn?.trim() || fh.journalEn,
                      'ltr',
                      firstMarks,
                    ),
                    line(fh.issueLineEn, 'ltr', firstMarks),
                  ],
                  35,
                ),
                cell(
                  [
                    line(
                      journal?.titleAr?.trim() || fh.journalAr,
                      'rtl',
                      firstMarks,
                    ),
                    line(fh.issueLineAr, 'rtl', firstMarks),
                  ],
                  65,
                ),
              ],
            }),
          ],
        }),
        ruled('bottom'),
      ],
    });

    // Pages 2+: article-language title, then author surnames at the far side.
    const lang: Lang = rtl ? 'ar' : 'en';
    const titleSection =
      frontMatter?.titles[lang] ??
      content.sections.find((s): s is TitleSection => s.kind === 'title');
    const authorsSection =
      frontMatter?.authors ??
      content.sections.find((s): s is AuthorsSection => s.kind === 'authors');
    const surnames = (authorsSection?.authors ?? [])
      .map((a) => authorSurname(a.fullName))
      .filter(Boolean)
      .join(rtl ? '، ' : ', ');
    const runningHeader = new Header({
      children: [
        new Table({
          width: fullWidth,
          borders: NO_TABLE_BORDERS,
          visuallyRightToLeft: rtl,
          rows: [
            new TableRow({
              children: [
                cell(
                  [
                    line(titleSection?.text ?? '', articleDir, {
                      sizeOverride: size,
                    }),
                  ],
                  60,
                ),
                // A left-to-right paragraph so "far side" is unambiguous in both directions.
                cell(
                  [
                    new Paragraph({
                      alignment: rtl ? AlignmentType.LEFT : AlignmentType.RIGHT,
                      children: this.runs(surnames, articleDir, profile, {
                        sizeOverride: size,
                      }),
                    }),
                  ],
                  40,
                ),
              ],
            }),
          ],
        }),
        ruled('bottom'),
      ],
    });

    const pageOf = rtl ? pf.pageOfAr : pf.pageOfEn;
    const pageNumber = () =>
      new Paragraph({
        bidirectional: rtl,
        alignment: AlignmentType.BOTH,
        children: [
          new TextRun({
            children: [PageNumber.CURRENT],
            size,
            sizeComplexScript: size,
          }),
          ...this.runs(` ${pageOf} `, articleDir, profile, {
            sizeOverride: size,
          }),
          new TextRun({
            children: [PageNumber.TOTAL_PAGES],
            size,
            sizeComplexScript: size,
          }),
        ],
      });

    // Page 1 footer: page count beside the ISSN and journal site.
    const issn = journal?.eissn?.trim()
      ? `ISSN: ${journal.eissn.trim()} (online)`
      : pf.issnLabel;
    const firstFooter = new Footer({
      children: [
        ruled('top'),
        new Table({
          width: fullWidth,
          borders: NO_TABLE_BORDERS,
          visuallyRightToLeft: rtl,
          rows: [
            new TableRow({
              children: [
                cell([pageNumber()], 20),
                cell(
                  [
                    line(issn, 'ltr', { sizeOverride: size }),
                    new Paragraph({
                      children: [
                        new ExternalHyperlink({
                          link: pf.websiteUrl,
                          children: [
                            new TextRun({
                              text: pf.websiteUrl,
                              size,
                              sizeComplexScript: size,
                              style: 'Hyperlink',
                            }),
                          ],
                        }),
                      ],
                    }),
                  ],
                  80,
                ),
              ],
            }),
          ],
        }),
      ],
    });

    return {
      headers: { first: firstHeader, default: runningHeader },
      footers: {
        first: firstFooter,
        default: new Footer({ children: [pageNumber()] }),
      },
    };
  }

  // ── Sections outside the bilingual layout ──────────────────────────────────

  private buildTitle(
    section: TitleSection,
    dir: ConstructorDir,
    profile: ManuscriptStyleProfile,
  ): Paragraph {
    return new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.BOTH,
      bidirectional: dir === 'rtl',
      children: this.runs(section.text || '', dir, profile, {
        bold: true,
        sizeOverride: profile.sizesHalfPoints.title,
      }),
    });
  }

  private buildHeading(
    section: HeadingSection,
    dir: ConstructorDir,
    profile: ManuscriptStyleProfile,
  ): Paragraph {
    const [level, size] =
      section.kind === 'heading1'
        ? [HeadingLevel.HEADING_1, profile.sizesHalfPoints.heading1]
        : section.kind === 'heading2'
          ? [HeadingLevel.HEADING_2, profile.sizesHalfPoints.heading2]
          : [HeadingLevel.HEADING_3, profile.sizesHalfPoints.heading3];
    return new Paragraph({
      heading: level,
      bidirectional: dir === 'rtl',
      alignment: AlignmentType.BOTH,
      keepNext: true,
      children: this.runs(section.text || '', dir, profile, {
        bold: true,
        sizeOverride: size,
      }),
    });
  }

  private buildAuthors(
    section: AuthorsSection,
    dir: ConstructorDir,
    profile: ManuscriptStyleProfile,
  ): Paragraph[] {
    const out: Paragraph[] = [];
    for (const a of section.authors) {
      const star = a.isCorresponding ? '*' : '';
      const headerText = `${a.fullName}${star} — ${a.title}`;
      const bodyText = [a.affiliation, a.specialization, a.email]
        .filter((p) => p?.trim())
        .join(' — ');
      out.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          bidirectional: dir === 'rtl',
          children: this.runs(headerText, dir, profile, { bold: true }),
        }),
      );
      out.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          bidirectional: dir === 'rtl',
          children: this.runs(bodyText, dir, profile),
        }),
      );
    }
    return out;
  }

  private buildAbstract(
    section: AbstractSection,
    profile: ManuscriptStyleProfile,
  ): Paragraph[] {
    const dir: ConstructorDir = section.lang === 'ar' ? 'rtl' : 'ltr';
    const rtl = dir === 'rtl';
    const out: Paragraph[] = [
      new Paragraph({
        bidirectional: rtl,
        alignment: AlignmentType.BOTH,
        keepNext: true,
        children: this.runs(rtl ? 'الملخص:' : 'Abstract:', dir, profile, {
          bold: true,
          sizeOverride: profile.sizesHalfPoints.heading1,
        }),
      }),
      new Paragraph({
        bidirectional: rtl,
        alignment: AlignmentType.BOTH,
        children: this.runs(section.text || '', dir, profile),
      }),
    ];
    if (section.keywords?.trim()) {
      out.push(
        new Paragraph({
          bidirectional: rtl,
          alignment: AlignmentType.BOTH,
          children: [
            ...this.runs(
              rtl ? 'الكلمات المفتاحية: ' : 'Keywords: ',
              dir,
              profile,
              {
                bold: true,
              },
            ),
            ...this.runs(section.keywords, dir, profile),
          ],
        }),
      );
    }
    return out;
  }

  private buildDocxContext(
    content: ConstructorContent,
    imageResolver: ImageResolver,
  ): DocxBuildContext {
    const footnotesById = new Map(
      (content.footnotes ?? []).map((fn) => [fn.id, fn]),
    );
    const referenced = new Set<string>();
    for (const section of content.sections) {
      if ('html' in section && section.html) {
        for (const id of collectFootnoteIdsFromHtml(section.html)) {
          referenced.add(id);
        }
      }
      if (section.kind === 'references') {
        for (const item of section.items) {
          const html = resolveReferenceEntryHtml(item);
          for (const id of collectFootnoteIdsFromHtml(html)) {
            referenced.add(id);
          }
        }
      }
    }
    const footnoteNumById = new Map<string, number>();
    const endnoteNumById = new Map<string, number>();
    let footnoteNum = 0;
    let endnoteNum = 0;
    for (const id of referenced) {
      const fn = footnotesById.get(id);
      if (!fn) continue;
      if (fn.placement === 'endnote') {
        endnoteNum += 1;
        endnoteNumById.set(id, endnoteNum);
      } else {
        footnoteNum += 1;
        footnoteNumById.set(id, footnoteNum);
      }
    }
    return {
      imageResolver,
      footnoteNumById,
      endnoteNumById,
      footnotesById,
    };
  }

  private buildDocxFootnoteParts(
    ctx: DocxBuildContext,
    profile: ManuscriptStyleProfile,
    dir: ConstructorDir,
  ): Pick<IPropertiesOptions, 'footnotes' | 'endnotes'> {
    const footnoteSize =
      profile.footnoteSizeHalfPoints ?? profile.sizesHalfPoints.bodyLatin;
    const noteBody = (fn: ConstructorFootnote) => ({
      children: [
        new Paragraph({
          bidirectional: dir === 'rtl',
          alignment: AlignmentType.BOTH,
          children: this.runs(
            fn.text.replace(/<[^>]+>/g, '').trim(),
            dir,
            profile,
            {
              sizeOverride: footnoteSize,
            },
          ),
        }),
      ],
    });
    const footnotes: Record<number, { children: Paragraph[] }> = {};
    const endnotes: Record<number, { children: Paragraph[] }> = {};
    for (const [id, num] of ctx.footnoteNumById) {
      const fn = ctx.footnotesById.get(id);
      if (fn) footnotes[num] = noteBody(fn);
    }
    for (const [id, num] of ctx.endnoteNumById) {
      const fn = ctx.footnotesById.get(id);
      if (fn) endnotes[num] = noteBody(fn);
    }
    return {
      ...(Object.keys(footnotes).length ? { footnotes } : {}),
      ...(Object.keys(endnotes).length ? { endnotes } : {}),
    };
  }

  private async buildParagraph(
    section: ParagraphSection,
    dir: ConstructorDir,
    profile: ManuscriptStyleProfile,
    ctx: DocxBuildContext,
  ): Promise<Paragraph[]> {
    const sanitized = sanitizeConstructorTipTapHtml(section.html ?? '');
    const wrapped = `<root>${sanitized}</root>`;
    const root = parse(wrapped, {
      sourceCodeLocationInfo: false,
    });
    return this.htmlToParagraphs(root as unknown as Node, dir, profile, ctx);
  }

  private async buildImage(
    section: ImageSection,
    dir: ConstructorDir,
    figureNumber: number,
    imageResolver: ImageResolver,
    profile: ManuscriptStyleProfile,
  ): Promise<Paragraph[]> {
    const captionPara = new Paragraph({
      style: this.figureCaptionStyleId(profile),
      alignment: AlignmentType.CENTER,
      bidirectional: dir === 'rtl',
      children: this.runs(
        this.captionText(
          'figure',
          figureNumber,
          section.caption || '',
          dir,
          profile,
        ),
        dir,
        profile,
        { bold: true, sizeOverride: profile.sizesHalfPoints.caption },
      ),
    });

    let imagePara: Paragraph;
    if (section.fileId) {
      const file = await imageResolver(section.fileId);
      if (file) {
        imagePara = new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              type: this.imageTypeFromMime(file.mime),
              data: file.data,
              transformation: { width: 480, height: 320 },
              altText: {
                title: section.altText || `Figure ${figureNumber}`,
                description: section.altText || section.caption || '',
                name: section.altText || `figure-${figureNumber}`,
              },
            }),
          ],
        });
      } else {
        imagePara = new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            this.run(
              `[Missing image: ${section.altText || section.fileId}]`,
              dir,
              profile,
              { italics: true },
            ),
          ],
        });
      }
    } else {
      imagePara = new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          this.run('[No image uploaded]', dir, profile, { italics: true }),
        ],
      });
    }

    if (profile.captions.figureCaptionAfterImage) {
      return [imagePara, captionPara];
    }
    return [captionPara, imagePara];
  }

  private buildTable(
    section: TableSection,
    dir: ConstructorDir,
    tableNumber: number,
    profile: ManuscriptStyleProfile,
  ): Block[] {
    const rtl = dir === 'rtl';
    const captionSize = profile.sizesHalfPoints.caption;
    const captionPara = new Paragraph({
      style: this.tableCaptionStyleId(profile),
      alignment: AlignmentType.CENTER,
      bidirectional: rtl,
      keepNext: profile.captions.tableCaptionBeforeTable,
      children: this.runs(
        this.captionText(
          'table',
          tableNumber,
          section.caption || '',
          dir,
          profile,
        ),
        dir,
        profile,
        { bold: true, sizeOverride: captionSize },
      ),
    });

    const ruled = profile.tableBorders === 'horizontalRules';
    const normalizedRows = normalizeTableRows(section.rows);
    const rows = normalizedRows.map((row, rowIdx) => {
      const isHeader = section.hasHeaderRow && rowIdx === 0;
      return new TableRow({
        tableHeader: isHeader,
        children: row
          .filter((cell) => !isTableCellCovered(cell))
          .map((cell) => {
            const rowSpan = cell.rowSpan ?? 1;
            const colSpan = cell.colSpan ?? 1;
            return new TableCell({
              rowSpan: rowSpan > 1 ? rowSpan : undefined,
              columnSpan: colSpan > 1 ? colSpan : undefined,
              shading:
                isHeader && !ruled
                  ? { type: 'clear', color: 'auto', fill: 'EEEEEE' }
                  : undefined,
              children: [
                new Paragraph({
                  bidirectional: rtl,
                  alignment: AlignmentType.BOTH,
                  children: this.runs(getTableCellText(cell), dir, profile, {
                    bold: isHeader || undefined,
                    sizeOverride: captionSize,
                  }),
                }),
              ],
            });
          }),
      });
    });
    const tableBlock =
      rows.length > 0
        ? new Table({
            rows,
            visuallyRightToLeft: rtl,
            width: { size: 100, type: WidthType.PERCENTAGE },
            ...(ruled
              ? {
                  borders: {
                    top: HEAVY_RULE_BORDER,
                    bottom: HEAVY_RULE_BORDER,
                    insideHorizontal: RULE_BORDER,
                    left: NO_BORDER,
                    right: NO_BORDER,
                    insideVertical: NO_BORDER,
                  },
                }
              : {}),
          })
        : null;

    const out: Block[] = [];
    if (profile.captions.tableCaptionBeforeTable) {
      out.push(captionPara);
      if (tableBlock) out.push(tableBlock);
    } else {
      if (tableBlock) out.push(tableBlock);
      out.push(captionPara);
    }
    const notes = section.notes?.trim();
    if (notes) {
      out.push(
        new Paragraph({
          style: this.tableNoteStyleId(profile),
          bidirectional: rtl,
          alignment: AlignmentType.BOTH,
          children: this.runs(notes, dir, profile, {
            sizeOverride: captionSize,
          }),
        }),
      );
    }
    return out;
  }

  private async buildRichTextBlock(
    section: RichTextBlockSection,
    dir: ConstructorDir,
    profile: ManuscriptStyleProfile,
    ctx: DocxBuildContext,
  ): Promise<Paragraph[]> {
    return this.buildParagraph(
      { ...section, kind: 'paragraph', html: section.html },
      dir,
      profile,
      ctx,
    );
  }

  private async buildEquation(
    section: EquationSection,
    dir: ConstructorDir,
    equationNumber: number,
    profile: ManuscriptStyleProfile,
  ): Promise<Paragraph[]> {
    const out: Paragraph[] = [];
    const latex = section.latex?.trim();
    if (!latex) {
      out.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            this.run('[Empty equation]', dir, profile, { italics: true }),
          ],
        }),
      );
      return out;
    }
    try {
      const rendered = await this.equationOmml.renderEquation(latex);
      const children: ParagraphChild[] =
        rendered.kind === 'omml'
          ? [...rendered.children]
          : [
              new ImageRun({
                type: 'png',
                data: rendered.png,
                transformation: {
                  width: Math.round(rendered.widthPx / 2),
                  height: Math.round(rendered.heightPx / 2),
                },
              }),
            ];
      if (section.numbered) {
        children.push(this.run(` (${equationNumber})`, dir, profile));
      }
      out.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          bidirectional: dir === 'rtl',
          children,
        }),
      );
    } catch {
      out.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            this.run(`[Equation: ${latex}]`, dir, profile, { italics: true }),
            ...(section.numbered
              ? [this.run(` (${equationNumber})`, dir, profile)]
              : []),
          ],
        }),
      );
    }
    return out;
  }

  private async buildReferences(
    section: ReferencesSection,
    articleDir: ConstructorDir,
    profile: ManuscriptStyleProfile,
    ctx: DocxBuildContext,
    citationStyle: CitationStyle,
  ): Promise<Paragraph[]> {
    const refs = profile.references;
    const items = [...section.items].filter((i) => referenceEntryHasContent(i));
    // Vancouver: the in-text [n] point at list positions, so the author's order
    // (order of first citation) is kept and numbered — sorting would repoint them.
    const vancouver = citationStyle === 'vancouver';
    const ordered = vancouver
      ? items
      : sortReferencesApa(items, refs.arabicFirst);
    const headingText =
      articleDir === 'ltr'
        ? (refs.headingTextLtr ?? refs.headingText)
        : refs.headingText;
    const out: Paragraph[] = [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        bidirectional: articleDir === 'rtl',
        alignment: AlignmentType.BOTH,
        keepNext: true,
        children: this.runs(headingText, articleDir, profile, {
          bold: true,
          sizeOverride: profile.sizesHalfPoints.heading1,
        }),
      }),
    ];
    const sp = refs.entrySpacing;
    for (const entry of ordered) {
      const dir: ConstructorDir = entry.lang === 'ar' ? 'rtl' : 'ltr';
      const html = resolveReferenceEntryHtml(entry);
      const children = await this.collectInlineFromSanitizedHtml(
        html,
        dir,
        profile,
        ctx,
      );
      const doi = entry.doi?.trim();
      if (doi && !html.includes(doi)) {
        children.push(this.run(` https://doi.org/${doi}`, 'ltr', profile));
      }
      out.push(
        new Paragraph({
          bidirectional: dir === 'rtl',
          alignment: AlignmentType.BOTH,
          spacing: { before: sp.before, after: sp.after },
          ...(refs.numbered || vancouver
            ? { numbering: { reference: REFERENCES_NUMBERING, level: 0 } }
            : {}),
          children,
        }),
      );
    }
    return out;
  }

  /** Flatten sanitized reference HTML into a single paragraph's inline runs. */
  private async collectInlineFromSanitizedHtml(
    html: string,
    dir: ConstructorDir,
    profile: ManuscriptStyleProfile,
    ctx: DocxBuildContext,
  ): Promise<ParagraphChild[]> {
    const sanitized = sanitizeConstructorTipTapHtml(html);
    const wrapped = `<root>${sanitized}</root>`;
    const root = parse(wrapped, {
      sourceCodeLocationInfo: false,
    });
    const out: ParagraphChild[] = [];
    const walk = async (node: Node): Promise<void> => {
      if (!('childNodes' in node) || !node.childNodes) return;
      for (const child of node.childNodes) {
        if (!('tagName' in child)) continue;
        const tag = child.tagName.toLowerCase();
        if (tag === 'p' || tag === 'li') {
          out.push(...(await this.collectInline(child, dir, profile, {}, ctx)));
        } else if (tag === 'root' || tag === 'body' || tag === 'html') {
          await walk(child);
        }
      }
    };
    await walk(root as unknown as Node);
    if (out.length === 0) {
      out.push(this.run('', dir, profile));
    }
    return out;
  }

  private async htmlToParagraphs(
    node: Node,
    dir: ConstructorDir,
    profile: ManuscriptStyleProfile,
    ctx: DocxBuildContext,
  ): Promise<Paragraph[]> {
    const out: Paragraph[] = [];
    await this.walkBlocks(node, dir, profile, out, {}, ctx);
    if (out.length === 0) {
      out.push(
        new Paragraph({
          bidirectional: dir === 'rtl',
          children: [this.run('', dir, profile)],
        }),
      );
    }
    return out;
  }

  private async walkBlocks(
    node: Node,
    dir: ConstructorDir,
    profile: ManuscriptStyleProfile,
    out: Paragraph[],
    activeMarks: InlineMarks,
    ctx: DocxBuildContext,
  ): Promise<void> {
    if (!('childNodes' in node) || !node.childNodes) return;
    for (const child of node.childNodes) {
      if (!('tagName' in child)) continue;
      const tag = child.tagName.toLowerCase();
      if (tag === 'p') {
        const inline = await this.collectInline(
          child,
          dir,
          profile,
          activeMarks,
          ctx,
        );
        out.push(
          new Paragraph({
            bidirectional: dir === 'rtl',
            alignment: AlignmentType.BOTH,
            children: inline,
          }),
        );
      } else if (tag === 'ul' || tag === 'ol') {
        const ref =
          tag === 'ol'
            ? profile.numbering.decimalReference
            : profile.numbering.bulletReference;
        for (const li of child.childNodes ?? []) {
          if (
            'tagName' in li &&
            (li as Element).tagName.toLowerCase() === 'li'
          ) {
            const inline = await this.collectInline(
              li as Element,
              dir,
              profile,
              activeMarks,
              ctx,
            );
            out.push(
              new Paragraph({
                bidirectional: dir === 'rtl',
                alignment: AlignmentType.BOTH,
                numbering: { reference: ref, level: 0 },
                children: inline,
              }),
            );
          }
        }
      } else if (tag === 'root' || tag === 'html' || tag === 'body') {
        await this.walkBlocks(child, dir, profile, out, activeMarks, ctx);
      } else if (tag === 'head') {
        // parse5 wraps fragments in <html><head/><body>; <head> is not content.
        continue;
      } else {
        out.push(
          new Paragraph({
            bidirectional: dir === 'rtl',
            alignment: AlignmentType.BOTH,
            children: await this.collectInline(
              child,
              dir,
              profile,
              activeMarks,
              ctx,
            ),
          }),
        );
      }
    }
  }

  private async collectInline(
    node: Node,
    dir: ConstructorDir,
    profile: ManuscriptStyleProfile,
    inheritedMarks: InlineMarks,
    ctx: DocxBuildContext,
  ): Promise<ParagraphChild[]> {
    const out: ParagraphChild[] = [];
    await this.walkInline(node, dir, profile, inheritedMarks, out, ctx);
    if (out.length === 0) {
      out.push(this.run('', dir, profile, inheritedMarks));
    }
    return out;
  }

  private async walkInline(
    node: Node,
    dir: ConstructorDir,
    profile: ManuscriptStyleProfile,
    marks: InlineMarks,
    out: ParagraphChild[],
    ctx: DocxBuildContext,
  ): Promise<void> {
    if (!('childNodes' in node) || !node.childNodes) return;
    for (const child of node.childNodes) {
      if (this.isTextNode(child)) {
        const text = child.value;
        if (text) out.push(...this.runs(text, dir, profile, marks));
        continue;
      }
      if (!('tagName' in child)) continue;
      const tag = child.tagName.toLowerCase();
      if (tag === 'br') {
        out.push(
          new TextRun({
            text: '',
            break: 1,
            ...this.runOpts((marks.runDir ?? dir) === 'rtl', profile, marks),
          }),
        );
        continue;
      }
      if (tag === 'a') {
        const href = sanitizeConstructorLinkHref(
          this.elementAttr(child as Element, 'href'),
        );
        const linkChildren = (
          await this.collectInline(child, dir, profile, marks, ctx)
        ).filter((c): c is TextRun => c instanceof TextRun);
        if (href && linkChildren.length > 0) {
          out.push(
            new ExternalHyperlink({
              link: href,
              children: linkChildren,
            }),
          );
        } else {
          await this.walkInline(child, dir, profile, marks, out, ctx);
        }
        continue;
      }
      if (tag === 'img') {
        const fileId = this.elementAttr(
          child as Element,
          'data-file-id',
        )?.trim();
        if (fileId) {
          const resolved = await ctx.imageResolver(fileId);
          if (resolved) {
            out.push(
              new ImageRun({
                type: this.imageTypeFromMime(resolved.mime),
                data: resolved.data,
                transformation: { width: 180, height: 120 },
              }),
            );
          }
        }
        continue;
      }
      if (tag === 'sup') {
        const footnoteId = this.elementAttr(
          child as Element,
          'data-footnote-id',
        )?.trim();
        if (footnoteId) {
          const fn = ctx.footnotesById.get(footnoteId);
          if (fn?.placement === 'endnote') {
            const num = ctx.endnoteNumById.get(footnoteId);
            if (num) out.push(new EndnoteReferenceRun(num));
          } else {
            const num = ctx.footnoteNumById.get(footnoteId);
            if (num) out.push(new FootnoteReferenceRun(num));
          }
          continue;
        }
      }
      const nextMarks: InlineMarks = { ...marks };
      if (tag === 'strong' || tag === 'b') nextMarks.bold = true;
      else if (tag === 'em' || tag === 'i') nextMarks.italics = true;
      else if (tag === 'u') nextMarks.underline = true;
      else if (tag === 'sup') nextMarks.superScript = true;
      else if (tag === 'sub') nextMarks.subScript = true;
      else if (tag === 'span') {
        const spanDir = this.elementAttr(
          child as Element,
          'dir',
        )?.toLowerCase();
        if (spanDir === 'ltr' || spanDir === 'rtl') {
          nextMarks.runDir = spanDir;
        }
      }
      await this.walkInline(child, dir, profile, nextMarks, out, ctx);
    }
  }

  private isTextNode(node: Node): node is TextNode {
    return (node as TextNode).nodeName === '#text';
  }

  private elementAttr(el: Element, name: string): string | undefined {
    return el.attrs?.find((a) => a.name === name)?.value;
  }

  /** One run with the direction of its context — labels, markers, placeholders. */
  private run(
    text: string,
    dir: ConstructorDir,
    profile: ManuscriptStyleProfile,
    marks: InlineMarks = {},
  ) {
    return new TextRun({
      text,
      ...this.runOpts((marks.runDir ?? dir) === 'rtl', profile, marks),
    });
  }

  /** Text split into per-script runs (see {@link splitTextByScript}). */
  private runs(
    text: string,
    dir: ConstructorDir,
    profile: ManuscriptStyleProfile,
    marks: InlineMarks = {},
  ): TextRun[] {
    return splitTextByScript(text, (marks.runDir ?? dir) === 'rtl').map(
      (segment) =>
        new TextRun({
          text: segment.text,
          ...this.runOpts(segment.rtl, profile, marks),
        }),
    );
  }

  private runOpts(
    rtl: boolean,
    profile: ManuscriptStyleProfile,
    marks: InlineMarks,
  ): IRunOptions {
    const f = profile.fonts;
    const s = profile.sizesHalfPoints;
    return {
      bold: marks.bold,
      boldComplexScript: marks.bold,
      italics: marks.italics,
      italicsComplexScript: marks.italics,
      underline: marks.underline ? {} : undefined,
      superScript: marks.superScript,
      subScript: marks.subScript,
      rightToLeft: rtl || undefined,
      font: { ascii: f.latin, hAnsi: f.latin, cs: f.arabic },
      // Word picks `sz` for Latin characters and `szCs` for Arabic ones.
      size: marks.sizeOverride ?? s.bodyLatin,
      sizeComplexScript: marks.sizeOverride ?? s.bodyArabic,
    };
  }

  private imageTypeFromMime(mime: string): 'jpg' | 'png' | 'gif' | 'bmp' {
    const m = mime.toLowerCase();
    if (m.includes('png')) return 'png';
    if (m.includes('gif')) return 'gif';
    if (m.includes('bmp')) return 'bmp';
    return 'jpg';
  }
}
