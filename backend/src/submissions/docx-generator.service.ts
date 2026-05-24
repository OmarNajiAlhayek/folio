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
import type { ManuscriptAlignment } from '../manuscript-styles/manuscript-style.types';
import type { ManuscriptStyleProfile } from '../manuscript-styles/manuscript-style.types';
import type {
  AbstractSection,
  AuthorsSection,
  ConstructorContent,
  ConstructorDir,
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
  /**
   * Builds a `.docx` Buffer from a ConstructorContent payload.
   *
   * Caller responsibilities:
   *  - Resolve image bytes for any `ImageSection.fileId` and pass via `imageResolver`.
   *  - Supply the resolved {@link ManuscriptStyleProfile} for layout (fonts, margins, etc.).
   */
  async generate(
    content: ConstructorContent,
    imageResolver: (
      fileId: string,
    ) => Promise<{ data: Buffer; mime: string } | null>,
    profile: ManuscriptStyleProfile,
  ): Promise<Buffer> {
    const defaultDir = content.defaultDir;
    let figureCounter = 0;
    let tableCounter = 0;

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
          children.push(...this.buildParagraph(section, dir, profile));
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
          children.push(...this.buildTable(section, dir, tableCounter, profile));
          break;
        }
        case 'references':
          children.push(...this.buildReferences(section, profile));
          break;
      }
    }

    const mm = profile.pageMarginsMm;
    const doc = new Document({
      styles: this.buildStyles(profile),
      numbering: this.buildNumbering(profile),
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
            titlePage: false,
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

  private tableCaptionStyleId(profile: ManuscriptStyleProfile): string {
    const t = profile.paragraphStyles.find(
      (p) => p.id === 'TableCaption' || p.name.toLowerCase().includes('table caption'),
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
      alignment:
        dir === 'rtl' ? AlignmentType.RIGHT : AlignmentType.LEFT,
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
    const headingText =
      section.lang === 'ar' ? 'الملخص' : 'Abstract';
    const keywordsLabel =
      section.lang === 'ar' ? 'الكلمات المفتاحية: ' : 'Keywords: ';
    const out: Paragraph[] = [
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        bidirectional: dir === 'rtl',
        alignment:
          dir === 'rtl' ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [this.run(headingText, dir, profile, { bold: true })],
      }),
      new Paragraph({
        bidirectional: dir === 'rtl',
        alignment:
          dir === 'rtl' ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [this.run(section.text || '', dir, profile)],
      }),
    ];
    if (section.keywords?.trim()) {
      out.push(
        new Paragraph({
          bidirectional: dir === 'rtl',
          alignment:
            dir === 'rtl' ? AlignmentType.RIGHT : AlignmentType.LEFT,
          children: [
            this.run(keywordsLabel, dir, profile, { bold: true }),
            this.run(section.keywords, dir, profile),
          ],
        }),
      );
    }
    return out;
  }

  private buildParagraph(
    section: ParagraphSection,
    dir: ConstructorDir,
    profile: ManuscriptStyleProfile,
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
    return this.htmlToParagraphs(root as unknown as Node, dir, profile);
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
                    this.run(cell ?? '', dir, profile, isHeader ? { bold: true } : {}),
                  ],
                }),
              ],
            }),
        ),
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
    return out;
  }

  private buildReferences(
    section: ReferencesSection,
    profile: ManuscriptStyleProfile,
  ): Paragraph[] {
    const items = [...section.items].filter((i) => i.text?.trim());
    const arabic = items
      .filter((i) => i.lang === 'ar')
      .sort((a, b) => a.text.localeCompare(b.text, 'ar'));
    const english = items
      .filter((i) => i.lang === 'en')
      .sort((a, b) => a.text.localeCompare(b.text, 'en'));
    const ordered = profile.references.arabicFirst
      ? [...arabic, ...english]
      : [...english, ...arabic];
    const out: Paragraph[] = [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [
          this.run(profile.references.headingText, 'ltr', profile, { bold: true }),
        ],
      }),
    ];
    const sp = profile.references.entrySpacing;
    const renderEntry = (
      entry: { text: string; doi?: string },
      dir: ConstructorDir,
    ) => {
      const children: ParagraphChild[] = [this.run(entry.text, dir, profile)];
      if (entry.doi?.trim()) {
        children.push(
          this.run(` https://doi.org/${entry.doi.trim()}`, 'ltr', profile),
        );
      }
      return new Paragraph({
        bidirectional: dir === 'rtl',
        alignment:
          dir === 'rtl' ? AlignmentType.RIGHT : AlignmentType.LEFT,
        spacing: { before: sp.before, after: sp.after },
        children,
      });
    };
    for (const item of ordered) {
      out.push(renderEntry(item, item.lang === 'ar' ? 'rtl' : 'ltr'));
    }
    return out;
  }

  private htmlToParagraphs(
    node: Node,
    dir: ConstructorDir,
    profile: ManuscriptStyleProfile,
  ): Paragraph[] {
    const out: Paragraph[] = [];
    this.walkBlocks(node, dir, profile, out, {});
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

  private walkBlocks(
    node: Node,
    dir: ConstructorDir,
    profile: ManuscriptStyleProfile,
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
            children: this.collectInline(child, dir, profile, activeMarks),
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
            out.push(
              new Paragraph({
                bidirectional: dir === 'rtl',
                alignment:
                  dir === 'rtl' ? AlignmentType.RIGHT : AlignmentType.LEFT,
                numbering: { reference: ref, level: 0 },
                children: this.collectInline(li as Element, dir, profile, activeMarks),
              }),
            );
          }
        }
      } else if (tag === 'root' || tag === 'html' || tag === 'body') {
        this.walkBlocks(child, dir, profile, out, activeMarks);
      } else {
        out.push(
          new Paragraph({
            bidirectional: dir === 'rtl',
            children: this.collectInline(child, dir, profile, activeMarks),
          }),
        );
      }
    }
  }

  private collectInline(
    node: Node,
    dir: ConstructorDir,
    profile: ManuscriptStyleProfile,
    inheritedMarks: InlineMarks,
  ): ParagraphChild[] {
    const out: ParagraphChild[] = [];
    this.walkInline(node, dir, profile, inheritedMarks, out);
    if (out.length === 0) {
      out.push(this.run('', dir, profile, inheritedMarks));
    }
    return out;
  }

  private walkInline(
    node: Node,
    dir: ConstructorDir,
    profile: ManuscriptStyleProfile,
    marks: InlineMarks,
    out: ParagraphChild[],
  ): void {
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
      const nextMarks: InlineMarks = { ...marks };
      if (tag === 'strong' || tag === 'b') nextMarks.bold = true;
      else if (tag === 'em' || tag === 'i') nextMarks.italics = true;
      else if (tag === 'u') nextMarks.underline = true;
      this.walkInline(child, dir, profile, nextMarks, out);
    }
  }

  private isTextNode(node: Node): node is TextNode {
    return (node as TextNode).nodeName === '#text';
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
    const isRtl = dir === 'rtl';
    const f = profile.fonts;
    const s = profile.sizesHalfPoints;
    return {
      bold: marks.bold,
      italics: marks.italics,
      underline: marks.underline ? {} : undefined,
      rightToLeft: isRtl,
      font: isRtl
        ? { ascii: f.latin, hAnsi: f.latin, cs: f.arabic }
        : { ascii: f.latin, hAnsi: f.latin, cs: f.arabic },
      size: isRtl ? s.bodyArabic : s.bodyLatin,
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
