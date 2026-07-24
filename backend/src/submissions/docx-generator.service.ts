import { Injectable } from '@nestjs/common';
import {
  AlignmentType,
  Document,
  EndnoteReferenceRun,
  ExternalHyperlink,
  FootnoteReferenceRun,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  LineNumberRestartFormat,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertMillimetersToTwip,
  type IPropertiesOptions,
  type IRunOptions,
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
import type { ManuscriptAlignment } from '../manuscript-styles/manuscript-style.types';
import type { ManuscriptStyleProfile } from '../manuscript-styles/manuscript-style.types';
import type {
  AbstractSection,
  AuthorsSection,
  ConstructorContent,
  ConstructorDir,
  ConstructorFootnote,
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
  /** Override the resolved body font size (in half-points). */
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
  ): Promise<Buffer> {
    const defaultDir = content.defaultDir;
    const ctx = this.buildDocxContext(content, imageResolver);
    let figureCounter = 0;
    let tableCounter = 0;
    let equationCounter = 0;

    const children: Array<Paragraph | Table> = [];

    for (const section of content.sections) {
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
          children.push(...(await this.buildReferences(section, profile, ctx)));
          break;
      }
    }

    const mm = profile.pageMarginsMm;
    const noteParts = this.buildDocxFootnoteParts(ctx, profile, defaultDir);
    const doc = new Document({
      styles: this.buildStyles(profile),
      numbering: this.buildNumbering(profile),
      ...noteParts,
      sections: [
        {
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
                    restart: LineNumberRestartFormat.NEW_PAGE,
                    distance: convertMillimetersToTwip(7),
                  },
                }
              : {}),
          },
          children,
        },
      ],
    });

    return Packer.toBuffer(doc);
  }

  private buildStyles(profile: ManuscriptStyleProfile) {
    const f = profile.fonts;
    const s = profile.sizesHalfPoints;
    const h = profile.headingParagraphSpacing;
    const docSpacing = profile.documentParagraphSpacing;
    return {
      default: {
        document: {
          run: {
            font: { ascii: f.latin, hAnsi: f.latin, cs: f.arabic },
            size: s.bodyLatin,
          },
          paragraph: {
            spacing: {
              line: profile.documentLineSpacingTwips,
              before: docSpacing.before,
              after: docSpacing.after,
            },
          },
        },
        heading1: {
          run: { bold: true, size: s.heading1 },
          paragraph: {
            spacing: { before: h.heading1.before, after: h.heading1.after },
          },
        },
        heading2: {
          run: { bold: true, size: s.heading2 },
          paragraph: {
            spacing: { before: h.heading2.before, after: h.heading2.after },
          },
        },
        heading3: {
          run: { bold: true, size: s.heading3 },
          paragraph: {
            spacing: { before: h.heading3.before, after: h.heading3.after },
          },
        },
      },
      paragraphStyles: profile.paragraphStyles.map((ps) => ({
        id: ps.id,
        name: ps.name,
        basedOn: ps.basedOn,
        next: ps.next,
        run: {
          bold: ps.run.bold,
          size: ps.run.sizeHalfPoints,
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
    const bulletRef = profile.numbering.bulletReference;
    const decimalRef = profile.numbering.decimalReference;
    return {
      config: [
        {
          reference: bulletRef,
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '\u2022',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 720, hanging: 360 } },
              },
            },
          ],
        },
        {
          reference: decimalRef,
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
        },
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

  private buildTitle(
    section: TitleSection,
    dir: ConstructorDir,
    profile: ManuscriptStyleProfile,
  ): Paragraph {
    return new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      bidirectional: dir === 'rtl',
      children: [this.run(section.text || '', dir, profile, { bold: true })],
    });
  }

  private buildHeading(
    section: HeadingSection,
    dir: ConstructorDir,
    profile: ManuscriptStyleProfile,
  ): Paragraph {
    const level =
      section.kind === 'heading1'
        ? HeadingLevel.HEADING_1
        : section.kind === 'heading2'
          ? HeadingLevel.HEADING_2
          : HeadingLevel.HEADING_3;
    return new Paragraph({
      heading: level,
      bidirectional: dir === 'rtl',
      alignment: dir === 'rtl' ? AlignmentType.RIGHT : AlignmentType.LEFT,
      children: [this.run(section.text || '', dir, profile, { bold: true })],
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
      const bodyText = `${a.affiliation}${a.email ? ` — ${a.email}` : ''}`;
      out.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          bidirectional: dir === 'rtl',
          children: [this.run(headerText, dir, profile, { bold: true })],
        }),
      );
      out.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          bidirectional: dir === 'rtl',
          children: [this.run(bodyText, dir, profile)],
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
    const headingText = section.lang === 'ar' ? 'الملخص' : 'Abstract';
    const keywordsLabel =
      section.lang === 'ar' ? 'الكلمات المفتاحية: ' : 'Keywords: ';
    const out: Paragraph[] = [
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        bidirectional: dir === 'rtl',
        alignment: dir === 'rtl' ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [this.run(headingText, dir, profile, { bold: true })],
      }),
      new Paragraph({
        bidirectional: dir === 'rtl',
        alignment: dir === 'rtl' ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [this.run(section.text || '', dir, profile)],
      }),
    ];
    if (section.keywords?.trim()) {
      out.push(
        new Paragraph({
          bidirectional: dir === 'rtl',
          alignment: dir === 'rtl' ? AlignmentType.RIGHT : AlignmentType.LEFT,
          children: [
            this.run(keywordsLabel, dir, profile, { bold: true }),
            this.run(section.keywords, dir, profile),
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
    defaultDir: ConstructorDir,
  ): Pick<IPropertiesOptions, 'footnotes' | 'endnotes'> {
    const footnoteSize =
      profile.footnoteSizeHalfPoints ?? profile.sizesHalfPoints.bodyLatin;
    const footnotes: Record<number, { children: Paragraph[] }> = {};
    const endnotes: Record<number, { children: Paragraph[] }> = {};
    for (const [id, num] of ctx.footnoteNumById) {
      const fn = ctx.footnotesById.get(id);
      if (!fn) continue;
      footnotes[num] = {
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: fn.text.replace(/<[^>]+>/g, '').trim(),
                size: footnoteSize,
                rightToLeft: defaultDir === 'rtl',
                font: {
                  ascii: profile.fonts.latin,
                  hAnsi: profile.fonts.latin,
                  cs: profile.fonts.arabic,
                },
              }),
            ],
          }),
        ],
      };
    }
    for (const [id, num] of ctx.endnoteNumById) {
      const fn = ctx.footnotesById.get(id);
      if (!fn) continue;
      endnotes[num] = {
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: fn.text.replace(/<[^>]+>/g, '').trim(),
                size: footnoteSize,
                rightToLeft: defaultDir === 'rtl',
                font: {
                  ascii: profile.fonts.latin,
                  hAnsi: profile.fonts.latin,
                  cs: profile.fonts.arabic,
                },
              }),
            ],
          }),
        ],
      };
    }
    return {
      ...(Object.keys(footnotes).length ? { footnotes } : {}),
      ...(Object.keys(endnotes).length ? { endnotes } : {}),
    };
  }

  private async buildFootnoteBody(
    html: string,
    defaultDir: ConstructorDir,
    profile: ManuscriptStyleProfile,
    ctx: DocxBuildContext,
  ): Promise<Paragraph[]> {
    const sanitized = sanitizeConstructorTipTapHtml(html ?? '');
    const wrapped = `<root>${sanitized}</root>`;
    const root = parse(wrapped, {
      sourceCodeLocationInfo: false,
    });
    return this.htmlToParagraphs(
      root as unknown as Node,
      defaultDir,
      profile,
      ctx,
    );
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
    imageResolver: (
      fileId: string,
    ) => Promise<{ data: Buffer; mime: string } | null>,
    profile: ManuscriptStyleProfile,
  ): Promise<Paragraph[]> {
    const captionStyle = this.figureCaptionStyleId(profile);
    const captionPara = new Paragraph({
      style: captionStyle,
      bidirectional: dir === 'rtl',
      children: [
        this.run(
          `${profile.captions.figureWord} ${figureNumber}: ${section.caption || ''}`,
          dir,
          profile,
          { bold: true },
        ),
      ],
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
  ): Array<Paragraph | Table> {
    const captionStyle = this.tableCaptionStyleId(profile);
    const captionPara = new Paragraph({
      style: captionStyle,
      bidirectional: dir === 'rtl',
      children: [
        this.run(
          `${profile.captions.tableWord} ${tableNumber}: ${section.caption || ''}`,
          dir,
          profile,
          { bold: true },
        ),
      ],
    });

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
              shading: isHeader
                ? { type: 'clear', color: 'auto', fill: 'EEEEEE' }
                : undefined,
              children: [
                new Paragraph({
                  bidirectional: dir === 'rtl',
                  alignment:
                    dir === 'rtl' ? AlignmentType.RIGHT : AlignmentType.LEFT,
                  children: [
                    this.run(getTableCellText(cell), dir, profile, {
                      bold: isHeader || undefined,
                      sizeOverride: profile.sizesHalfPoints.caption,
                    }),
                  ],
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
            visuallyRightToLeft: dir === 'rtl',
            width: { size: 100, type: WidthType.PERCENTAGE },
          })
        : null;

    const out: Array<Paragraph | Table> = [];
    if (profile.captions.tableCaptionBeforeTable) {
      out.push(captionPara);
      if (tableBlock) out.push(tableBlock);
    } else {
      if (tableBlock) out.push(tableBlock);
      out.push(captionPara);
    }
    const notes = section.notes?.trim();
    if (notes) {
      const noteStyle = this.tableNoteStyleId(profile);
      out.push(
        new Paragraph({
          style: noteStyle,
          bidirectional: dir === 'rtl',
          alignment: dir === 'rtl' ? AlignmentType.RIGHT : AlignmentType.LEFT,
          children: [this.run(notes, dir, profile)],
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
    profile: ManuscriptStyleProfile,
    ctx: DocxBuildContext,
  ): Promise<Paragraph[]> {
    const items = [...section.items].filter((i) => referenceEntryHasContent(i));
    const arabic = items
      .filter((i) => i.lang === 'ar')
      .sort((a, b) =>
        referenceEntrySortKey(a).localeCompare(referenceEntrySortKey(b), 'ar'),
      );
    const english = items
      .filter((i) => i.lang === 'en')
      .sort((a, b) =>
        referenceEntrySortKey(a).localeCompare(referenceEntrySortKey(b), 'en'),
      );
    const ordered = profile.references.arabicFirst
      ? [...arabic, ...english]
      : [...english, ...arabic];
    const out: Paragraph[] = [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [
          this.run(
            profile.references.headingText,
            profile.references.arabicFirst ? 'rtl' : 'ltr',
            profile,
            { bold: true },
          ),
        ],
      }),
    ];
    const sp = profile.references.entrySpacing;
    const renderEntry = async (
      entry: ReferencesSection['items'][number],
      dir: ConstructorDir,
    ) => {
      const html = resolveReferenceEntryHtml(entry);
      const children = await this.collectInlineFromSanitizedHtml(
        html,
        dir,
        profile,
        ctx,
      );
      if (entry.doi?.trim()) {
        children.push(
          this.run(` https://doi.org/${entry.doi.trim()}`, 'ltr', profile),
        );
      }
      return new Paragraph({
        bidirectional: dir === 'rtl',
        alignment: dir === 'rtl' ? AlignmentType.RIGHT : AlignmentType.LEFT,
        spacing: { before: sp.before, after: sp.after },
        children,
      });
    };
    for (const item of ordered) {
      out.push(await renderEntry(item, item.lang === 'ar' ? 'rtl' : 'ltr'));
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
            bidirectional: true,
            alignment: dir === 'rtl' ? AlignmentType.RIGHT : AlignmentType.LEFT,
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
                alignment:
                  dir === 'rtl' ? AlignmentType.RIGHT : AlignmentType.LEFT,
                numbering: { reference: ref, level: 0 },
                children: inline,
              }),
            );
          }
        }
      } else if (tag === 'root' || tag === 'html' || tag === 'body') {
        await this.walkBlocks(child, dir, profile, out, activeMarks, ctx);
      } else {
        out.push(
          new Paragraph({
            bidirectional: dir === 'rtl',
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
        if (text) out.push(this.run(text, dir, profile, marks));
        continue;
      }
      if (!('tagName' in child)) continue;
      const tag = child.tagName.toLowerCase();
      if (tag === 'br') {
        out.push(
          new TextRun({
            text: '',
            break: 1,
            ...this.runOpts(dir, profile, marks),
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

  private run(
    text: string,
    dir: ConstructorDir,
    profile: ManuscriptStyleProfile,
    marks: InlineMarks = {},
  ) {
    return new TextRun({ text, ...this.runOpts(dir, profile, marks) });
  }

  private runOpts(
    dir: ConstructorDir,
    profile: ManuscriptStyleProfile,
    marks: InlineMarks,
  ): IRunOptions {
    const isRtl = (marks.runDir ?? dir) === 'rtl';
    const f = profile.fonts;
    const s = profile.sizesHalfPoints;
    return {
      bold: marks.bold,
      italics: marks.italics,
      underline: marks.underline ? {} : undefined,
      superScript: marks.superScript,
      subScript: marks.subScript,
      rightToLeft: isRtl,
      font: isRtl
        ? { ascii: f.latin, hAnsi: f.latin, cs: f.arabic }
        : { ascii: f.latin, hAnsi: f.latin, cs: f.arabic },
      size: marks.sizeOverride ?? (isRtl ? s.bodyArabic : s.bodyLatin),
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
