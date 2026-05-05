import { Injectable } from '@nestjs/common';
import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertMillimetersToTwip,
  type IRunOptions,
  type ParagraphChild,
} from 'docx';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import sanitizeHtml from 'sanitize-html';
import type {
  AbstractSection,
  AuthorsSection,
  ConstructorContent,
  ConstructorDir,
  ConstructorSection,
  HeadingSection,
  ImageSection,
  ParagraphSection,
  ReferencesSection,
  TableSection,
  TitleSection,
} from './constructor-content.types';
import { resolveSectionDir } from './constructor-content.types';

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
};

/**
 * Standard fonts per `style.md`.
 *  - Latin script: Times New Roman 11 pt
 *  - Arabic script: Simplified Arabic 12 pt (set as the run's `bidi` font)
 *  - Captions / table text: 10 pt regardless of script
 *  - H1 (title): 16 pt bold
 *  - H2 (subtitle): 14 pt bold
 *  - H3: 12 pt bold (not in spec, interpolated)
 */
const FONT = {
  latin: 'Times New Roman',
  arabic: 'Simplified Arabic',
};

const SIZE = {
  bodyLatin: 22, // 11 pt × 2 (docx uses half-points)
  bodyArabic: 24, // 12 pt × 2
  caption: 20, // 10 pt × 2
  heading1: 32, // 16 pt × 2
  heading2: 28, // 14 pt × 2
  heading3: 24, // 12 pt × 2
};

const NUMBERING_BULLET_REF = 'constructor-bullet';
const NUMBERING_DECIMAL_REF = 'constructor-decimal';

@Injectable()
export class DocxGeneratorService {
  /**
   * Builds a `.docx` Buffer from a ConstructorContent payload.
   *
   * Caller responsibilities:
   *  - Resolve image bytes for any `ImageSection.fileId` and pass via `imageResolver`.
   *  - Caption numbering is derived here (Nth image → "Figure N", Nth table → "Table N").
   */
  async generate(
    content: ConstructorContent,
    imageResolver: (
      fileId: string,
    ) => Promise<{ data: Buffer; mime: string } | null>,
  ): Promise<Buffer> {
    const defaultDir = content.defaultDir;
    let figureCounter = 0;
    let tableCounter = 0;

    const children: Array<Paragraph | Table> = [];

    for (const section of content.sections) {
      const dir = resolveSectionDir(section, defaultDir);
      switch (section.kind) {
        case 'title':
          children.push(this.buildTitle(section, dir));
          break;
        case 'authors':
          children.push(...this.buildAuthors(section, dir));
          break;
        case 'abstract':
          children.push(...this.buildAbstract(section));
          break;
        case 'heading1':
        case 'heading2':
        case 'heading3':
          children.push(this.buildHeading(section, dir));
          break;
        case 'paragraph':
          children.push(...this.buildParagraph(section, dir));
          break;
        case 'image': {
          figureCounter += 1;
          children.push(
            ...(await this.buildImage(
              section,
              dir,
              figureCounter,
              imageResolver,
            )),
          );
          break;
        }
        case 'table': {
          tableCounter += 1;
          children.push(...this.buildTable(section, dir, tableCounter));
          break;
        }
        case 'references':
          children.push(...this.buildReferences(section));
          break;
      }
    }

    const doc = new Document({
      styles: this.buildStyles(),
      numbering: this.buildNumbering(),
      sections: [
        {
          properties: {
            page: {
              size: { orientation: PageOrientation.PORTRAIT },
              // style.md: top 3cm, bottom/left/right 2cm; header 1.8cm; footer 0.6cm
              margin: {
                top: convertMillimetersToTwip(30),
                bottom: convertMillimetersToTwip(20),
                left: convertMillimetersToTwip(20),
                right: convertMillimetersToTwip(20),
                header: convertMillimetersToTwip(18),
                footer: convertMillimetersToTwip(6),
              },
            },
            // style.md: different odd and even pages
            titlePage: false,
          },
          children,
        },
      ],
    });

    return Packer.toBuffer(doc);
  }

  // ---------------------------------------------------------------------------
  // Styles & numbering
  // ---------------------------------------------------------------------------

  private buildStyles() {
    return {
      default: {
        document: {
          run: {
            font: { ascii: FONT.latin, hAnsi: FONT.latin, cs: FONT.arabic },
            size: SIZE.bodyLatin,
          },
          paragraph: {
            spacing: { line: 240, before: 0, after: 0 }, // single line, no extra spacing
          },
        },
        heading1: {
          run: { bold: true, size: SIZE.heading1 },
          paragraph: { spacing: { before: 240, after: 120 } },
        },
        heading2: {
          run: { bold: true, size: SIZE.heading2 },
          paragraph: { spacing: { before: 200, after: 100 } },
        },
        heading3: {
          run: { bold: true, size: SIZE.heading3 },
          paragraph: { spacing: { before: 160, after: 80 } },
        },
      },
      paragraphStyles: [
        {
          id: 'FigureCaption',
          name: 'Figure Caption',
          basedOn: 'Normal',
          next: 'Normal',
          run: { bold: true, size: SIZE.caption },
          paragraph: {
            alignment: AlignmentType.CENTER,
            spacing: { before: 80, after: 200 },
          },
        },
        {
          id: 'TableCaption',
          name: 'Table Caption',
          basedOn: 'Normal',
          next: 'Normal',
          run: { bold: true, size: SIZE.caption },
          paragraph: {
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 80 },
          },
        },
        {
          id: 'TableNote',
          name: 'Table Note',
          basedOn: 'Normal',
          next: 'Normal',
          run: { size: SIZE.caption },
          paragraph: { spacing: { before: 40, after: 80 } },
        },
      ],
    };
  }

  private buildNumbering() {
    return {
      config: [
        {
          reference: NUMBERING_BULLET_REF,
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
          reference: NUMBERING_DECIMAL_REF,
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

  // ---------------------------------------------------------------------------
  // Section builders
  // ---------------------------------------------------------------------------

  private buildTitle(section: TitleSection, dir: ConstructorDir): Paragraph {
    return new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      bidirectional: dir === 'rtl',
      children: [this.run(section.text || '', dir, { bold: true })],
    });
  }

  private buildHeading(
    section: HeadingSection,
    dir: ConstructorDir,
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
      children: [this.run(section.text || '', dir, { bold: true })],
    });
  }

  private buildAuthors(
    section: AuthorsSection,
    dir: ConstructorDir,
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
          children: [this.run(headerText, dir, { bold: true })],
        }),
      );
      out.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          bidirectional: dir === 'rtl',
          children: [this.run(bodyText, dir)],
        }),
      );
    }
    return out;
  }

  private buildAbstract(section: AbstractSection): Paragraph[] {
    const dir: ConstructorDir = section.lang === 'ar' ? 'rtl' : 'ltr';
    const headingText =
      section.lang === 'ar' ? 'الملخص' : 'Abstract';
    const keywordsLabel =
      section.lang === 'ar' ? 'الكلمات المفتاحية: ' : 'Keywords: ';
    const out: Paragraph[] = [
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        bidirectional: dir === 'rtl',
        alignment: dir === 'rtl' ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [this.run(headingText, dir, { bold: true })],
      }),
      new Paragraph({
        bidirectional: dir === 'rtl',
        alignment: dir === 'rtl' ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [this.run(section.text || '', dir)],
      }),
    ];
    if (section.keywords?.trim()) {
      out.push(
        new Paragraph({
          bidirectional: dir === 'rtl',
          alignment: dir === 'rtl' ? AlignmentType.RIGHT : AlignmentType.LEFT,
          children: [
            this.run(keywordsLabel, dir, { bold: true }),
            this.run(section.keywords, dir),
          ],
        }),
      );
    }
    return out;
  }

  private buildParagraph(
    section: ParagraphSection,
    dir: ConstructorDir,
  ): Paragraph[] {
    const sanitized = sanitizeHtml(section.html ?? '', {
      allowedTags: [
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
      ],
      allowedAttributes: {},
    });
    const wrapped = `<root>${sanitized}</root>`;
    const root = parse(wrapped, {
      sourceCodeLocationInfo: false,
    }) as DefaultTreeAdapterMap['document'];
    return this.htmlToParagraphs(root as unknown as Node, dir);
  }

  private async buildImage(
    section: ImageSection,
    dir: ConstructorDir,
    figureNumber: number,
    imageResolver: (
      fileId: string,
    ) => Promise<{ data: Buffer; mime: string } | null>,
  ): Promise<Paragraph[]> {
    const out: Paragraph[] = [];
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
              { italics: true },
            ),
          ],
        });
      }
    } else {
      imagePara = new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          this.run('[No image uploaded]', dir, { italics: true }),
        ],
      });
    }
    out.push(imagePara);
    out.push(
      new Paragraph({
        style: 'FigureCaption',
        bidirectional: dir === 'rtl',
        children: [
          this.run(
            `Figure ${figureNumber}: ${section.caption || ''}`,
            dir,
            { bold: true },
          ),
        ],
      }),
    );
    return out;
  }

  private buildTable(
    section: TableSection,
    dir: ConstructorDir,
    tableNumber: number,
  ): Array<Paragraph | Table> {
    const out: Array<Paragraph | Table> = [];
    out.push(
      new Paragraph({
        style: 'TableCaption',
        bidirectional: dir === 'rtl',
        children: [
          this.run(
            `Table ${tableNumber}: ${section.caption || ''}`,
            dir,
            { bold: true },
          ),
        ],
      }),
    );
    const rows = (section.rows ?? []).map((row, rowIdx) => {
      const isHeader = section.hasHeaderRow && rowIdx === 0;
      return new TableRow({
        tableHeader: isHeader,
        children: row.map(
          (cell) =>
            new TableCell({
              shading: isHeader
                ? { type: 'clear', color: 'auto', fill: 'EEEEEE' }
                : undefined,
              children: [
                new Paragraph({
                  bidirectional: dir === 'rtl',
                  alignment:
                    dir === 'rtl' ? AlignmentType.RIGHT : AlignmentType.LEFT,
                  children: [
                    this.run(cell ?? '', dir, isHeader ? { bold: true } : {}),
                  ],
                }),
              ],
            }),
        ),
      });
    });
    if (rows.length > 0) {
      out.push(
        new Table({
          rows,
          visuallyRightToLeft: dir === 'rtl',
          width: { size: 100, type: WidthType.PERCENTAGE },
        }),
      );
    }
    return out;
  }

  private buildReferences(section: ReferencesSection): Paragraph[] {
    // style.md: Arabic references first (alphabetical), then English (alphabetical)
    const items = [...section.items].filter((i) => i.text?.trim());
    const arabic = items
      .filter((i) => i.lang === 'ar')
      .sort((a, b) => a.text.localeCompare(b.text, 'ar'));
    const english = items
      .filter((i) => i.lang === 'en')
      .sort((a, b) => a.text.localeCompare(b.text, 'en'));
    const out: Paragraph[] = [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [this.run('References', 'ltr', { bold: true })],
      }),
    ];
    const renderEntry = (
      entry: { text: string; doi?: string },
      dir: ConstructorDir,
    ) => {
      const children: ParagraphChild[] = [this.run(entry.text, dir)];
      if (entry.doi?.trim()) {
        children.push(this.run(` https://doi.org/${entry.doi.trim()}`, 'ltr'));
      }
      return new Paragraph({
        bidirectional: dir === 'rtl',
        alignment: dir === 'rtl' ? AlignmentType.RIGHT : AlignmentType.LEFT,
        spacing: { before: 60, after: 60 },
        children,
      });
    };
    for (const item of arabic) out.push(renderEntry(item, 'rtl'));
    for (const item of english) out.push(renderEntry(item, 'ltr'));
    return out;
  }

  // ---------------------------------------------------------------------------
  // HTML → docx mapping (TipTap output)
  // ---------------------------------------------------------------------------

  private htmlToParagraphs(node: Node, dir: ConstructorDir): Paragraph[] {
    const out: Paragraph[] = [];
    this.walkBlocks(node, dir, out, {});
    if (out.length === 0) {
      out.push(
        new Paragraph({
          bidirectional: dir === 'rtl',
          children: [this.run('', dir)],
        }),
      );
    }
    return out;
  }

  private walkBlocks(
    node: Node,
    dir: ConstructorDir,
    out: Paragraph[],
    activeMarks: InlineMarks,
  ): void {
    if (!('childNodes' in node) || !node.childNodes) return;
    for (const child of node.childNodes) {
      if (!('tagName' in child)) continue;
      const tag = child.tagName.toLowerCase();
      if (tag === 'p') {
        out.push(
          new Paragraph({
            bidirectional: dir === 'rtl',
            alignment:
              dir === 'rtl' ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: this.collectInline(child, dir, activeMarks),
          }),
        );
      } else if (tag === 'ul' || tag === 'ol') {
        const ref =
          tag === 'ol' ? NUMBERING_DECIMAL_REF : NUMBERING_BULLET_REF;
        for (const li of child.childNodes ?? []) {
          if (
            'tagName' in li &&
            (li as Element).tagName.toLowerCase() === 'li'
          ) {
            out.push(
              new Paragraph({
                bidirectional: dir === 'rtl',
                alignment:
                  dir === 'rtl' ? AlignmentType.RIGHT : AlignmentType.LEFT,
                numbering: { reference: ref, level: 0 },
                children: this.collectInline(li as Element, dir, activeMarks),
              }),
            );
          }
        }
      } else if (tag === 'root' || tag === 'html' || tag === 'body') {
        this.walkBlocks(child, dir, out, activeMarks);
      } else {
        // Treat unknown block as a paragraph fallback.
        out.push(
          new Paragraph({
            bidirectional: dir === 'rtl',
            children: this.collectInline(child, dir, activeMarks),
          }),
        );
      }
    }
  }

  private collectInline(
    node: Node,
    dir: ConstructorDir,
    inheritedMarks: InlineMarks,
  ): ParagraphChild[] {
    const out: ParagraphChild[] = [];
    this.walkInline(node, dir, inheritedMarks, out);
    if (out.length === 0) {
      out.push(this.run('', dir, inheritedMarks));
    }
    return out;
  }

  private walkInline(
    node: Node,
    dir: ConstructorDir,
    marks: InlineMarks,
    out: ParagraphChild[],
  ): void {
    if (!('childNodes' in node) || !node.childNodes) return;
    for (const child of node.childNodes) {
      if (this.isTextNode(child)) {
        const text = child.value;
        if (text) out.push(this.run(text, dir, marks));
        continue;
      }
      if (!('tagName' in child)) continue;
      const tag = child.tagName.toLowerCase();
      if (tag === 'br') {
        out.push(
          new TextRun({ text: '', break: 1, ...this.runOpts(dir, marks) }),
        );
        continue;
      }
      const nextMarks: InlineMarks = { ...marks };
      if (tag === 'strong' || tag === 'b') nextMarks.bold = true;
      else if (tag === 'em' || tag === 'i') nextMarks.italics = true;
      else if (tag === 'u') nextMarks.underline = true;
      this.walkInline(child, dir, nextMarks, out);
    }
  }

  private isTextNode(node: Node): node is TextNode {
    return (node as TextNode).nodeName === '#text';
  }

  // ---------------------------------------------------------------------------
  // Run construction
  // ---------------------------------------------------------------------------

  private run(text: string, dir: ConstructorDir, marks: InlineMarks = {}) {
    return new TextRun({ text, ...this.runOpts(dir, marks) });
  }

  private runOpts(dir: ConstructorDir, marks: InlineMarks): IRunOptions {
    const isRtl = dir === 'rtl';
    return {
      bold: marks.bold,
      italics: marks.italics,
      underline: marks.underline ? {} : undefined,
      rightToLeft: isRtl,
      font: isRtl
        ? { ascii: FONT.latin, hAnsi: FONT.latin, cs: FONT.arabic }
        : { ascii: FONT.latin, hAnsi: FONT.latin, cs: FONT.arabic },
      size: isRtl ? SIZE.bodyArabic : SIZE.bodyLatin,
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
