import JSZip from 'jszip';
import { checkDocxFormat } from './docx-format-checker';
import type { ManuscriptStyleProfile } from '../manuscript-styles/manuscript-style.types';

// ── Minimal profile mirroring Damascus University journal v1 ─────────────────
const PROFILE: ManuscriptStyleProfile = {
  id: 'test-profile',
  version: 1,
  displayNameKey: 'test',
  descriptionKey: 'test',
  fonts: { latin: 'Times New Roman', arabic: 'Simplified Arabic' },
  sizesHalfPoints: {
    bodyLatin: 22, // 11 pt
    bodyArabic: 24, // 12 pt
    caption: 20,
    heading1: 32,
    heading2: 28,
    heading3: 24,
  },
  pageMarginsMm: {
    top: 30, // 1701 twips
    bottom: 20, // 1134 twips
    left: 20, // 1134 twips
    right: 20, // 1134 twips
    header: 18, // 1021 twips
    footer: 6, //  340 twips
  },
  documentLineSpacingTwips: 240,
  documentParagraphSpacing: { before: 0, after: 0 },
  headingParagraphSpacing: {
    heading1: { before: 240, after: 120 },
    heading2: { before: 200, after: 100 },
    heading3: { before: 160, after: 80 },
  },
  numbering: { bulletReference: 'b', decimalReference: 'd' },
  paragraphStyles: [],
  captions: {
    figureWord: 'Figure',
    tableWord: 'Table',
    figureCaptionAfterImage: true,
    tableCaptionBeforeTable: true,
  },
  references: {
    arabicFirst: true,
    headingText: 'References',
    entrySpacing: { before: 0, after: 0 },
  },
  footnoteSizeHalfPoints: 20, // 10 pt
  previewTheme: {
    fontFamilyLatinStack: '"Times New Roman", serif',
    fontFamilyArabicStack: '"Simplified Arabic", serif',
    figureCaptionBelowImage: true,
    tableCaptionAboveTable: true,
    referencesArabicFirst: true,
    figureWord: 'Figure',
    tableWord: 'Table',
    referencesHeading: 'References',
  },
};

// ── Twip helpers ─────────────────────────────────────────────────────────────
const MM = (mm: number) => Math.round(mm * 56.693);

// ── Docx builder ─────────────────────────────────────────────────────────────

interface MarginOptions {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  header?: number;
  footer?: number;
}

interface StyleOptions {
  latinFont?: string;
  arabicFont?: string;
  latinSizeHp?: number;
  arabicSizeHp?: number;
  /** Put font info in Normal style block instead of docDefaults */
  inNormalStyle?: boolean;
}

interface DocxOptions {
  margins?: MarginOptions | null; // null = omit w:pgMar entirely
  cols?: number; // default 1
  style?: StyleOptions | null; // null = omit font/size info
  /** Spacing added to Normal style's <w:pPr><w:spacing .../> */
  spacing?: {
    lineTwips?: number;
    lineRule?: string;
    beforeTwips?: number;
    afterTwips?: number;
  } | null;
  /** If set, adds a Heading1/Heading2 style with the given half-point size */
  headingSizes?: { h1?: number; h2?: number };
  /** If set, adds a FootnoteText style with the given half-point size */
  footnoteSizeHp?: number;
  omitDocumentXml?: boolean;
  omitStylesXml?: boolean;
}

function buildMarginAttr(m: Required<MarginOptions>): string {
  return (
    `w:top="${m.top}" w:right="${m.right}" w:bottom="${m.bottom}" ` +
    `w:left="${m.left}" w:header="${m.header}" w:footer="${m.footer}" w:gutter="0"`
  );
}

function buildDocumentXml(opts: DocxOptions): string {
  const marginLine =
    opts.margins === null
      ? ''
      : (() => {
          const m: Required<MarginOptions> = {
            top: opts.margins?.top ?? MM(30),
            bottom: opts.margins?.bottom ?? MM(20),
            left: opts.margins?.left ?? MM(20),
            right: opts.margins?.right ?? MM(20),
            header: opts.margins?.header ?? MM(18),
            footer: opts.margins?.footer ?? MM(6),
          };
          return `<w:pgMar ${buildMarginAttr(m)}/>`;
        })();

  const colsNum = opts.cols ?? 1;
  const colsLine =
    colsNum === 1
      ? '<w:cols w:space="708"/>'
      : `<w:cols w:num="${colsNum}" w:space="708"/>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Hello</w:t></w:r></w:p>
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      ${marginLine}
      ${colsLine}
    </w:sectPr>
  </w:body>
</w:document>`;
}

function buildFontBlock(s: StyleOptions): string {
  const parts: string[] = [];
  if (s.latinFont !== undefined || s.arabicFont !== undefined) {
    const ascii =
      s.latinFont !== undefined
        ? ` w:ascii="${s.latinFont}" w:hAnsi="${s.latinFont}"`
        : '';
    const cs = s.arabicFont !== undefined ? ` w:cs="${s.arabicFont}"` : '';
    parts.push(`<w:rFonts${ascii}${cs}/>`);
  }
  if (s.latinSizeHp !== undefined) {
    parts.push(`<w:sz w:val="${s.latinSizeHp}"/>`);
  }
  if (s.arabicSizeHp !== undefined) {
    parts.push(`<w:szCs w:val="${s.arabicSizeHp}"/>`);
  }
  return parts.join('\n        ');
}

function buildStylesXml(opts: DocxOptions): string {
  if (opts.style === null) {
    // Valid styles.xml but no font/size info at all
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>
</w:styles>`;
  }

  const s: StyleOptions = opts.style ?? {
    latinFont: 'Times New Roman',
    arabicFont: 'Simplified Arabic',
    latinSizeHp: 22,
    arabicSizeHp: 24,
  };
  const fontBlock = buildFontBlock({
    latinFont: s.latinFont ?? 'Times New Roman',
    arabicFont: s.arabicFont ?? 'Simplified Arabic',
    latinSizeHp: s.latinSizeHp ?? 22,
    arabicSizeHp: s.arabicSizeHp ?? 24,
  });

  if (s.inNormalStyle) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults/>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr>
      ${fontBlock}
    </w:rPr>
  </w:style>
</w:styles>`;
  }

  // Spacing element for Normal style pPr (if requested)
  const spacingAttr = opts.spacing
    ? [
        opts.spacing.lineTwips !== undefined
          ? `w:line="${opts.spacing.lineTwips}"`
          : '',
        opts.spacing.lineRule !== undefined
          ? `w:lineRule="${opts.spacing.lineRule}"`
          : '',
        opts.spacing.beforeTwips !== undefined
          ? `w:before="${opts.spacing.beforeTwips}"`
          : '',
        opts.spacing.afterTwips !== undefined
          ? `w:after="${opts.spacing.afterTwips}"`
          : '',
      ]
        .filter(Boolean)
        .join(' ')
    : null;
  const spacingLine = spacingAttr
    ? `<w:pPr><w:spacing ${spacingAttr}/></w:pPr>`
    : '';

  // Extra styles (headings, footnote)
  const extraStyles: string[] = [];
  if (opts.headingSizes?.h1 !== undefined) {
    extraStyles.push(
      `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:sz w:val="${opts.headingSizes.h1}"/></w:rPr></w:style>`,
    );
  }
  if (opts.headingSizes?.h2 !== undefined) {
    extraStyles.push(
      `<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:rPr><w:sz w:val="${opts.headingSizes.h2}"/></w:rPr></w:style>`,
    );
  }
  if (opts.footnoteSizeHp !== undefined) {
    extraStyles.push(
      `<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/><w:rPr><w:sz w:val="${opts.footnoteSizeHp}"/></w:rPr></w:style>`,
    );
  }

  // Default: fonts in docDefaults
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        ${fontBlock}
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    ${spacingLine}
  </w:style>
  ${extraStyles.join('\n  ')}
</w:styles>`;
}

async function makeDocx(opts: DocxOptions = {}): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  if (!opts.omitDocumentXml) {
    zip.file('word/document.xml', buildDocumentXml(opts));
  }
  if (!opts.omitStylesXml) {
    zip.file('word/styles.xml', buildStylesXml(opts));
  }
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`,
  );
  const data = await zip.generateAsync({ type: 'nodebuffer' });
  return Buffer.from(data);
}

// ─────────────────────────────────────────────────────────────────────────────

describe('checkDocxFormat', () => {
  // ── Error cases ─────────────────────────────────────────────────────────────

  describe('error cases', () => {
    it('returns DOCX_UNREADABLE for a non-ZIP buffer', async () => {
      const buf = Buffer.from('this is plain text, not a zip');
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v).toHaveLength(1);
      expect(v[0].code).toBe('DOCX_UNREADABLE');
      expect(v[0].messageAr).toMatch(/تعذّر/);
    });

    it('returns DOCX_UNREADABLE for an empty buffer', async () => {
      const v = await checkDocxFormat(Buffer.alloc(0), PROFILE);
      expect(v[0].code).toBe('DOCX_UNREADABLE');
    });

    it('returns DOCX_MISSING_PARTS when document.xml is absent', async () => {
      const buf = await makeDocx({ omitDocumentXml: true });
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v).toHaveLength(1);
      expect(v[0].code).toBe('DOCX_MISSING_PARTS');
    });

    it('returns DOCX_MISSING_PARTS when styles.xml is absent', async () => {
      const buf = await makeDocx({ omitStylesXml: true });
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v).toHaveLength(1);
      expect(v[0].code).toBe('DOCX_MISSING_PARTS');
    });
  });

  // ── Happy path ───────────────────────────────────────────────────────────────

  describe('correct format — no violations', () => {
    it('passes a perfectly formatted document', async () => {
      const buf = await makeDocx();
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v).toHaveLength(0);
    });

    it('passes when fonts are in the Normal style block (not docDefaults)', async () => {
      const buf = await makeDocx({ style: { inNormalStyle: true } });
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v).toHaveLength(0);
    });

    it('passes when font names match case-insensitively', async () => {
      const buf = await makeDocx({
        style: {
          latinFont: 'TIMES NEW ROMAN',
          arabicFont: 'simplified arabic',
          latinSizeHp: 22,
          arabicSizeHp: 24,
        },
      });
      const v = await checkDocxFormat(buf, PROFILE);
      const fontViolations = v.filter((x) => x.code.startsWith('FONT'));
      expect(fontViolations).toHaveLength(0);
    });

    it('passes margins within the ±3 mm tolerance', async () => {
      // 30mm ±2mm for top → still within 3mm tolerance
      const buf = await makeDocx({
        margins: {
          top: MM(28), // 2 mm under → within tolerance
          bottom: MM(22), // 2 mm over  → within tolerance
          left: MM(20),
          right: MM(20),
          header: MM(18),
          footer: MM(6),
        },
      });
      const v = await checkDocxFormat(buf, PROFILE);
      const marginViolations = v.filter((x) => x.code.startsWith('MARGIN'));
      expect(marginViolations).toHaveLength(0);
    });

    it('skips margin check when w:pgMar is absent', async () => {
      const buf = await makeDocx({ margins: null });
      const v = await checkDocxFormat(buf, PROFILE);
      const marginViolations = v.filter((x) => x.code.startsWith('MARGIN'));
      expect(marginViolations).toHaveLength(0);
    });

    it('skips font checks when Normal style has no font info', async () => {
      const buf = await makeDocx({ style: null });
      const v = await checkDocxFormat(buf, PROFILE);
      const fontViolations = v.filter((x) => x.code.startsWith('FONT'));
      expect(fontViolations).toHaveLength(0);
    });

    it('defaults to 1 column when w:cols element is absent', async () => {
      // We need a custom document.xml that omits <w:cols> entirely
      const zip = new JSZip();
      zip.file(
        'word/document.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Hello</w:t></w:r></w:p>
    <w:sectPr>
      <w:pgMar w:top="${MM(30)}" w:right="${MM(20)}" w:bottom="${MM(20)}" w:left="${MM(20)}" w:header="${MM(18)}" w:footer="${MM(6)}" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`,
      );
      zip.file(
        'word/styles.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr>
    <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Simplified Arabic"/>
    <w:sz w:val="22"/><w:szCs w:val="24"/>
  </w:rPr></w:rPrDefault></w:docDefaults>
</w:styles>`,
      );
      const buf = Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
      const v = await checkDocxFormat(buf, PROFILE, 1);
      expect(v.find((x) => x.code === 'COLUMN_COUNT')).toBeUndefined();
    });
  });

  // ── Margin violations ───────────────────────────────────────────────────────

  describe('margin violations', () => {
    it('reports MARGIN_TOP when top margin is too large', async () => {
      const buf = await makeDocx({ margins: { top: MM(44) } }); // 44mm, required 30mm
      const v = await checkDocxFormat(buf, PROFILE);
      const mv = v.find((x) => x.code === 'MARGIN_TOP');
      expect(mv).toBeDefined();
      expect(mv!.expected).toBe('30 mm');
      expect(mv!.message).toMatch(/top margin/);
      expect(mv!.messageAr).toMatch(/الهامش العلوي/);
    });

    it('reports MARGIN_BOTTOM when bottom margin is too small', async () => {
      const buf = await makeDocx({ margins: { bottom: MM(10) } }); // 10mm, required 20mm
      const v = await checkDocxFormat(buf, PROFILE);
      const mv = v.find((x) => x.code === 'MARGIN_BOTTOM');
      expect(mv).toBeDefined();
      expect(mv!.expected).toBe('20 mm');
    });

    it('reports MARGIN_LEFT when left margin is wrong', async () => {
      const buf = await makeDocx({ margins: { left: MM(25) } });
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v.find((x) => x.code === 'MARGIN_LEFT')).toBeDefined();
    });

    it('reports MARGIN_RIGHT when right margin is wrong', async () => {
      const buf = await makeDocx({ margins: { right: MM(35) } });
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v.find((x) => x.code === 'MARGIN_RIGHT')).toBeDefined();
    });

    it('reports MARGIN_HEADER when header distance is wrong', async () => {
      const buf = await makeDocx({ margins: { header: MM(25) } });
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v.find((x) => x.code === 'MARGIN_HEADER')).toBeDefined();
    });

    it('reports MARGIN_FOOTER when footer distance is wrong', async () => {
      const buf = await makeDocx({ margins: { footer: MM(15) } });
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v.find((x) => x.code === 'MARGIN_FOOTER')).toBeDefined();
    });

    it('reports all six margin violations when all margins are wrong', async () => {
      const buf = await makeDocx({
        margins: {
          top: MM(25),
          bottom: MM(25),
          left: MM(25),
          right: MM(25),
          header: MM(25),
          footer: MM(25),
        },
      });
      const v = await checkDocxFormat(buf, PROFILE);
      const codes = v.map((x) => x.code);
      expect(codes).toContain('MARGIN_TOP');
      expect(codes).toContain('MARGIN_BOTTOM');
      expect(codes).toContain('MARGIN_LEFT');
      expect(codes).toContain('MARGIN_RIGHT');
      expect(codes).toContain('MARGIN_HEADER');
      expect(codes).toContain('MARGIN_FOOTER');
    });

    it('does not flag a margin that is exactly 3 mm off (at tolerance boundary)', async () => {
      // top required 30mm; 27mm is exactly 3mm under = within tolerance
      const buf = await makeDocx({ margins: { top: MM(27) } });
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v.find((x) => x.code === 'MARGIN_TOP')).toBeUndefined();
    });

    it('flags a margin that is 4 mm off (just outside tolerance)', async () => {
      // top required 30mm; 26mm is 4mm under = outside tolerance
      const buf = await makeDocx({ margins: { top: MM(26) } });
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v.find((x) => x.code === 'MARGIN_TOP')).toBeDefined();
    });

    it('violation message includes actual and expected mm values', async () => {
      const buf = await makeDocx({ margins: { top: MM(25) } });
      const v = await checkDocxFormat(buf, PROFILE);
      const mv = v.find((x) => x.code === 'MARGIN_TOP')!;
      expect(mv.message).toMatch(/25/);
      expect(mv.message).toMatch(/30/);
    });
  });

  // ── Column count ────────────────────────────────────────────────────────────

  describe('column count violations', () => {
    it('reports COLUMN_COUNT when document has 2 columns but 1 expected', async () => {
      const buf = await makeDocx({ cols: 2 });
      const v = await checkDocxFormat(buf, PROFILE, 1);
      const cv = v.find((x) => x.code === 'COLUMN_COUNT');
      expect(cv).toBeDefined();
      expect(cv!.expected).toBe('1 column(s)');
      expect(cv!.found).toBe('2 column(s)');
      expect(cv!.messageAr).toMatch(/الأعمدة/);
    });

    it('reports COLUMN_COUNT when document has 1 column but 2 expected', async () => {
      const buf = await makeDocx({ cols: 1 });
      const v = await checkDocxFormat(buf, PROFILE, 2);
      expect(v.find((x) => x.code === 'COLUMN_COUNT')).toBeDefined();
    });

    it('passes when 2-column document is checked against expectedColumns=2', async () => {
      const buf = await makeDocx({ cols: 2 });
      const v = await checkDocxFormat(buf, PROFILE, 2);
      expect(v.find((x) => x.code === 'COLUMN_COUNT')).toBeUndefined();
    });

    it('passes when 1-column document is checked against default expectedColumns', async () => {
      const buf = await makeDocx({ cols: 1 });
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v.find((x) => x.code === 'COLUMN_COUNT')).toBeUndefined();
    });
  });

  // ── Font violations ─────────────────────────────────────────────────────────

  describe('font violations', () => {
    it('reports FONT_LATIN when Latin font is wrong', async () => {
      const buf = await makeDocx({
        style: {
          latinFont: 'Arial',
          arabicFont: 'Simplified Arabic',
          latinSizeHp: 22,
          arabicSizeHp: 24,
        },
      });
      const v = await checkDocxFormat(buf, PROFILE);
      const fv = v.find((x) => x.code === 'FONT_LATIN');
      expect(fv).toBeDefined();
      expect(fv!.expected).toBe('Times New Roman');
      expect(fv!.found).toBe('Arial');
      expect(fv!.messageAr).toMatch(/اللاتيني/);
    });

    it('reports FONT_ARABIC when Arabic font is wrong', async () => {
      const buf = await makeDocx({
        style: {
          latinFont: 'Times New Roman',
          arabicFont: 'Arial',
          latinSizeHp: 22,
          arabicSizeHp: 24,
        },
      });
      const v = await checkDocxFormat(buf, PROFILE);
      const fv = v.find((x) => x.code === 'FONT_ARABIC');
      expect(fv).toBeDefined();
      expect(fv!.expected).toBe('Simplified Arabic');
      expect(fv!.found).toBe('Arial');
      expect(fv!.messageAr).toMatch(/العربي/);
    });

    it('reports FONT_SIZE_LATIN when Latin size is wrong (12pt instead of 11pt)', async () => {
      const buf = await makeDocx({
        style: { latinSizeHp: 24, arabicSizeHp: 24 },
      }); // 12pt Latin
      const v = await checkDocxFormat(buf, PROFILE);
      const fv = v.find((x) => x.code === 'FONT_SIZE_LATIN');
      expect(fv).toBeDefined();
      expect(fv!.expected).toBe('11 pt');
      expect(fv!.found).toBe('12 pt');
    });

    it('reports FONT_SIZE_ARABIC when Arabic size is wrong (11pt instead of 12pt)', async () => {
      const buf = await makeDocx({
        style: { latinSizeHp: 22, arabicSizeHp: 22 },
      }); // 11pt Arabic
      const v = await checkDocxFormat(buf, PROFILE);
      const fv = v.find((x) => x.code === 'FONT_SIZE_ARABIC');
      expect(fv).toBeDefined();
      expect(fv!.expected).toBe('12 pt');
      expect(fv!.found).toBe('11 pt');
    });

    it('reports all four font violations simultaneously', async () => {
      const buf = await makeDocx({
        style: {
          latinFont: 'Calibri',
          arabicFont: 'Tahoma',
          latinSizeHp: 24, // 12pt
          arabicSizeHp: 20, // 10pt
        },
      });
      const v = await checkDocxFormat(buf, PROFILE);
      const codes = v.map((x) => x.code);
      expect(codes).toContain('FONT_LATIN');
      expect(codes).toContain('FONT_ARABIC');
      expect(codes).toContain('FONT_SIZE_LATIN');
      expect(codes).toContain('FONT_SIZE_ARABIC');
    });

    it('detects fonts in Normal style block (inNormalStyle=true)', async () => {
      const buf = await makeDocx({
        style: {
          latinFont: 'Calibri',
          arabicFont: 'Simplified Arabic',
          latinSizeHp: 22,
          arabicSizeHp: 24,
          inNormalStyle: true,
        },
      });
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v.find((x) => x.code === 'FONT_LATIN')).toBeDefined();
      expect(v.find((x) => x.code === 'FONT_ARABIC')).toBeUndefined();
    });
  });

  // ── Combined violations ──────────────────────────────────────────────────────

  describe('combined violations', () => {
    it('reports margin + column + font violations together', async () => {
      const buf = await makeDocx({
        margins: { top: MM(25) },
        cols: 2,
        style: {
          latinFont: 'Calibri',
          arabicFont: 'Simplified Arabic',
          latinSizeHp: 22,
          arabicSizeHp: 24,
        },
      });
      const v = await checkDocxFormat(buf, PROFILE, 1);
      const codes = v.map((x) => x.code);
      expect(codes).toContain('MARGIN_TOP');
      expect(codes).toContain('COLUMN_COUNT');
      expect(codes).toContain('FONT_LATIN');
    });

    it('each violation has all required fields', async () => {
      const buf = await makeDocx({
        margins: { top: MM(25) },
        style: {
          latinFont: 'Calibri',
          arabicFont: 'Simplified Arabic',
          latinSizeHp: 22,
          arabicSizeHp: 24,
        },
      });
      const v = await checkDocxFormat(buf, PROFILE);
      for (const violation of v) {
        expect(violation.code).toBeTruthy();
        expect(violation.message).toBeTruthy();
        expect(violation.messageAr).toBeTruthy();
        expect(violation.expected).toBeTruthy();
        expect(violation.found).toBeTruthy();
      }
    });
  });

  // ── Real-world margin values (Word default rounding) ─────────────────────────

  describe('real-world Word margin values', () => {
    it('accepts the exact twip values Word uses for Damascus University margins', async () => {
      // Word rounds 30mm → 1701, 20mm → 1134, 18mm → 1021, 6mm → 340
      const zip = new JSZip();
      zip.file(
        'word/document.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p/><w:sectPr>
    <w:pgMar w:top="1701" w:right="1134" w:bottom="1134" w:left="1134" w:header="1021" w:footer="340" w:gutter="0"/>
    <w:cols w:space="708"/>
  </w:sectPr></w:body>
</w:document>`,
      );
      zip.file(
        'word/styles.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr>
    <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Simplified Arabic"/>
    <w:sz w:val="22"/><w:szCs w:val="24"/>
  </w:rPr></w:rPrDefault></w:docDefaults>
</w:styles>`,
      );
      const buf = Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v).toHaveLength(0);
    });

    it('flags typical Microsoft Word default margins (2.54cm = 1440 twips)', async () => {
      // Word's default 1-inch (2.54cm) margins — wrong for Damascus University
      const buf = await makeDocx({
        margins: {
          top: 1440,
          bottom: 1440,
          left: 1440,
          right: 1440,
          header: 720,
          footer: 720,
        },
      });
      const v = await checkDocxFormat(buf, PROFILE);
      // All margins wrong — should have violations
      const marginCodes = v
        .filter((x) => x.code.startsWith('MARGIN'))
        .map((x) => x.code);
      expect(marginCodes).toContain('MARGIN_TOP'); // 1440 twips = 25.4mm, required 30mm → Δ4.6mm > 3mm
      expect(marginCodes).toContain('MARGIN_HEADER'); // 720 twips = 12.7mm, required 18mm → Δ5.3mm
      expect(marginCodes).toContain('MARGIN_FOOTER'); // 720 twips = 12.7mm, required 6mm → Δ6.7mm
    });
  });

  // ── Engineering: 2-column requirement ───────────────────────────────────────

  describe('engineering discipline — two-column layout', () => {
    it('passes an engineering doc with 2 columns when expectedColumns=2', async () => {
      const buf = await makeDocx({ cols: 2 });
      const v = await checkDocxFormat(buf, PROFILE, { expectedColumns: 2 });
      expect(v.find((x) => x.code === 'COLUMN_COUNT')).toBeUndefined();
    });

    it('flags an engineering doc with 1 column when expectedColumns=2', async () => {
      const buf = await makeDocx({ cols: 1 });
      const v = await checkDocxFormat(buf, PROFILE, { expectedColumns: 2 });
      const cv = v.find((x) => x.code === 'COLUMN_COUNT');
      expect(cv).toBeDefined();
      expect(cv!.expected).toBe('2 column(s)');
      expect(cv!.found).toBe('1 column(s)');
    });

    it('passes a non-engineering doc with 1 column (default)', async () => {
      const buf = await makeDocx({ cols: 1 });
      const v = await checkDocxFormat(buf, PROFILE, { expectedColumns: 1 });
      expect(v.find((x) => x.code === 'COLUMN_COUNT')).toBeUndefined();
    });
  });

  // ── Citation style: APA vs Vancouver ────────────────────────────────────────

  function makeDocxWithCitations(citationTexts: string[]): string {
    const body = citationTexts
      .map((c) => `<w:p><w:r><w:t>${c}</w:t></w:r></w:p>`)
      .join('\n');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${body}
    <w:sectPr>
      <w:pgMar w:top="${MM(30)}" w:right="${MM(20)}" w:bottom="${MM(20)}" w:left="${MM(20)}" w:header="${MM(18)}" w:footer="${MM(6)}" w:gutter="0"/>
      <w:cols w:space="708"/>
    </w:sectPr>
  </w:body>
</w:document>`;
  }

  async function makeDocxBufWithCitations(
    citationTexts: string[],
  ): Promise<Buffer> {
    const zip = new JSZip();
    zip.file('word/document.xml', makeDocxWithCitations(citationTexts));
    zip.file(
      'word/styles.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr>
    <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Simplified Arabic"/>
    <w:sz w:val="22"/><w:szCs w:val="24"/>
  </w:rPr></w:rPrDefault></w:docDefaults>
</w:styles>`,
    );
    return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
  }

  describe('citation style validation', () => {
    const VANCOUVER_CITES = ['[1]', '[2]', '[3,4]', '[5]'];
    const APA_CITES = [
      '(Smith, 2020)',
      '(Jones, 2019)',
      '(Ali et al., 2021)',
      '(Chen, 2022)',
    ];

    it('skips citation check when discipline is not provided', async () => {
      const buf = await makeDocxBufWithCitations(APA_CITES);
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v.find((x) => x.code === 'CITATION_STYLE')).toBeUndefined();
    });

    it('skips citation check when fewer than 3 citations found', async () => {
      const buf = await makeDocxBufWithCitations(['[1]', '[2]']);
      const v = await checkDocxFormat(buf, PROFILE, { discipline: 'medical' });
      expect(v.find((x) => x.code === 'CITATION_STYLE')).toBeUndefined();
    });

    // Medical (العلوم الطبية) → requires Vancouver
    it('passes medical discipline with Vancouver citations', async () => {
      const buf = await makeDocxBufWithCitations(VANCOUVER_CITES);
      const v = await checkDocxFormat(buf, PROFILE, { discipline: 'medical' });
      expect(v.find((x) => x.code === 'CITATION_STYLE')).toBeUndefined();
    });

    it('flags medical discipline using APA citations (requires Vancouver)', async () => {
      const buf = await makeDocxBufWithCitations(APA_CITES);
      const v = await checkDocxFormat(buf, PROFILE, { discipline: 'medical' });
      const cv = v.find((x) => x.code === 'CITATION_STYLE');
      expect(cv).toBeDefined();
      expect(cv!.expected).toBe('Vancouver [1]');
      expect(cv!.found).toBe('APA (Author, Year)');
      expect(cv!.message).toMatch(/Vancouver/);
      expect(cv!.messageAr).toMatch(/Vancouver/);
      expect(cv!.messageAr).toMatch(/الطبية/);
    });

    // Engineering (العلوم الهندسية) → requires APA
    it('passes engineering discipline with APA citations', async () => {
      const buf = await makeDocxBufWithCitations(APA_CITES);
      const v = await checkDocxFormat(buf, PROFILE, {
        discipline: 'engineering',
      });
      expect(v.find((x) => x.code === 'CITATION_STYLE')).toBeUndefined();
    });

    it('flags engineering discipline using Vancouver citations (requires APA)', async () => {
      const buf = await makeDocxBufWithCitations(VANCOUVER_CITES);
      const v = await checkDocxFormat(buf, PROFILE, {
        discipline: 'engineering',
      });
      const cv = v.find((x) => x.code === 'CITATION_STYLE');
      expect(cv).toBeDefined();
      expect(cv!.expected).toBe('APA (Author, Year)');
      expect(cv!.found).toBe('Vancouver [1]');
      expect(cv!.messageAr).toMatch(/الهندسية/);
    });

    // Other disciplines → require APA
    it('flags other discipline using Vancouver citations (requires APA)', async () => {
      const buf = await makeDocxBufWithCitations(VANCOUVER_CITES);
      const v = await checkDocxFormat(buf, PROFILE, { discipline: 'other' });
      expect(v.find((x) => x.code === 'CITATION_STYLE')).toBeDefined();
    });

    it('passes other discipline with APA citations', async () => {
      const buf = await makeDocxBufWithCitations(APA_CITES);
      const v = await checkDocxFormat(buf, PROFILE, { discipline: 'other' });
      expect(v.find((x) => x.code === 'CITATION_STYLE')).toBeUndefined();
    });

    it('engineering doc: 2-column + APA is fully valid', async () => {
      const zip = new JSZip();
      const apaCites = APA_CITES.map(
        (c) => `<w:p><w:r><w:t>${c}</w:t></w:r></w:p>`,
      ).join('\n');
      zip.file(
        'word/document.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${apaCites}
    <w:sectPr>
      <w:pgMar w:top="${MM(30)}" w:right="${MM(20)}" w:bottom="${MM(20)}" w:left="${MM(20)}" w:header="${MM(18)}" w:footer="${MM(6)}" w:gutter="0"/>
      <w:cols w:num="2" w:space="708"/>
    </w:sectPr>
  </w:body>
</w:document>`,
      );
      zip.file(
        'word/styles.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr>
    <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Simplified Arabic"/>
    <w:sz w:val="22"/><w:szCs w:val="24"/>
  </w:rPr></w:rPrDefault></w:docDefaults>
</w:styles>`,
      );
      const buf = Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
      const v = await checkDocxFormat(buf, PROFILE, {
        expectedColumns: 2,
        discipline: 'engineering',
      });
      expect(v).toHaveLength(0);
    });

    it('medical doc: 1-column + Vancouver is fully valid', async () => {
      const zip = new JSZip();
      const vcCites = VANCOUVER_CITES.map(
        (c) => `<w:p><w:r><w:t>${c}</w:t></w:r></w:p>`,
      ).join('\n');
      zip.file(
        'word/document.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${vcCites}
    <w:sectPr>
      <w:pgMar w:top="${MM(30)}" w:right="${MM(20)}" w:bottom="${MM(20)}" w:left="${MM(20)}" w:header="${MM(18)}" w:footer="${MM(6)}" w:gutter="0"/>
      <w:cols w:space="708"/>
    </w:sectPr>
  </w:body>
</w:document>`,
      );
      zip.file(
        'word/styles.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr>
    <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Simplified Arabic"/>
    <w:sz w:val="22"/><w:szCs w:val="24"/>
  </w:rPr></w:rPrDefault></w:docDefaults>
</w:styles>`,
      );
      const buf = Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
      const v = await checkDocxFormat(buf, PROFILE, {
        expectedColumns: 1,
        discipline: 'medical',
      });
      expect(v).toHaveLength(0);
    });
  });

  // ── Line spacing ──────────────────────────────────────────────────────────

  describe('line spacing', () => {
    it('passes when spacing element is absent (defaults to single)', async () => {
      const buf = await makeDocx(); // no spacing option → no <w:spacing> in Normal
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v.find((x) => x.code.startsWith('LINE_SPACING'))).toBeUndefined();
    });

    it('passes when spacing is exactly 240 twips auto (single)', async () => {
      const buf = await makeDocx({
        spacing: { lineTwips: 240, lineRule: 'auto' },
      });
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v.find((x) => x.code.startsWith('LINE_SPACING'))).toBeUndefined();
    });

    it('flags wrong line spacing value (480 = double)', async () => {
      const buf = await makeDocx({
        spacing: { lineTwips: 480, lineRule: 'auto' },
      });
      const v = await checkDocxFormat(buf, PROFILE);
      const lv = v.find((x) => x.code === 'LINE_SPACING');
      expect(lv).toBeDefined();
      expect(lv!.expected).toContain('240');
      expect(lv!.found).toContain('480');
      expect(lv!.messageAr).toMatch(/تباعد/);
    });

    it('flags lineRule="exact" (not auto)', async () => {
      const buf = await makeDocx({
        spacing: { lineTwips: 240, lineRule: 'exact' },
      });
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v.find((x) => x.code === 'LINE_SPACING_RULE')).toBeDefined();
    });

    it('flags lineRule="atLeast"', async () => {
      const buf = await makeDocx({
        spacing: { lineTwips: 240, lineRule: 'atLeast' },
      });
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v.find((x) => x.code === 'LINE_SPACING_RULE')).toBeDefined();
    });
  });

  // ── Paragraph spacing before/after ───────────────────────────────────────

  describe('paragraph spacing before/after', () => {
    it('passes when spacing element is absent', async () => {
      const buf = await makeDocx();
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v.find((x) => x.code.startsWith('PARA_SPACING'))).toBeUndefined();
    });

    it('passes when before=0 and after=0', async () => {
      const buf = await makeDocx({
        spacing: { beforeTwips: 0, afterTwips: 0 },
      });
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v.find((x) => x.code.startsWith('PARA_SPACING'))).toBeUndefined();
    });

    it('flags spacing after=160 (Word default 8pt)', async () => {
      const buf = await makeDocx({ spacing: { afterTwips: 160 } });
      const v = await checkDocxFormat(buf, PROFILE);
      const pv = v.find((x) => x.code === 'PARA_SPACING_AFTER');
      expect(pv).toBeDefined();
      expect(pv!.expected).toBe('0 twips');
      expect(pv!.found).toBe('160 twips');
      expect(pv!.messageAr).toMatch(/بعد الفقرة/);
    });

    it('flags spacing before=200', async () => {
      const buf = await makeDocx({ spacing: { beforeTwips: 200 } });
      const v = await checkDocxFormat(buf, PROFILE);
      const pv = v.find((x) => x.code === 'PARA_SPACING_BEFORE');
      expect(pv).toBeDefined();
      expect(pv!.found).toBe('200 twips');
      expect(pv!.messageAr).toMatch(/قبل الفقرة/);
    });

    it('flags both before and after when both wrong', async () => {
      const buf = await makeDocx({
        spacing: { beforeTwips: 100, afterTwips: 200 },
      });
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v.find((x) => x.code === 'PARA_SPACING_BEFORE')).toBeDefined();
      expect(v.find((x) => x.code === 'PARA_SPACING_AFTER')).toBeDefined();
    });
  });

  // ── Heading sizes ─────────────────────────────────────────────────────────

  describe('heading sizes', () => {
    it('skips heading check when style is absent from styles.xml', async () => {
      const buf = await makeDocx(); // no headingSizes option
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v.find((x) => x.code.startsWith('HEADING'))).toBeUndefined();
    });

    it('passes when H1=32hp (16pt) matches profile', async () => {
      const buf = await makeDocx({ headingSizes: { h1: 32 } });
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v.find((x) => x.code === 'HEADING1_SIZE')).toBeUndefined();
    });

    it('flags H1 with wrong size (24hp=12pt, required 32hp=16pt)', async () => {
      const buf = await makeDocx({ headingSizes: { h1: 24 } });
      const v = await checkDocxFormat(buf, PROFILE);
      const hv = v.find((x) => x.code === 'HEADING1_SIZE');
      expect(hv).toBeDefined();
      expect(hv!.expected).toBe('16 pt');
      expect(hv!.found).toBe('12 pt');
      expect(hv!.messageAr).toMatch(/العنوان الرئيسي/);
    });

    it('passes when H2=28hp (14pt) matches profile', async () => {
      const buf = await makeDocx({ headingSizes: { h2: 28 } });
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v.find((x) => x.code === 'HEADING2_SIZE')).toBeUndefined();
    });

    it('flags H2 with wrong size (22hp=11pt, required 28hp=14pt)', async () => {
      const buf = await makeDocx({ headingSizes: { h2: 22 } });
      const v = await checkDocxFormat(buf, PROFILE);
      const hv = v.find((x) => x.code === 'HEADING2_SIZE');
      expect(hv).toBeDefined();
      expect(hv!.expected).toBe('14 pt');
      expect(hv!.found).toBe('11 pt');
      expect(hv!.messageAr).toMatch(/العنوان الفرعي/);
    });

    it('flags both H1 and H2 together', async () => {
      const buf = await makeDocx({ headingSizes: { h1: 20, h2: 20 } });
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v.find((x) => x.code === 'HEADING1_SIZE')).toBeDefined();
      expect(v.find((x) => x.code === 'HEADING2_SIZE')).toBeDefined();
    });
  });

  // ── Footnote size ─────────────────────────────────────────────────────────

  describe('footnote size', () => {
    it('skips footnote check when FootnoteText style is absent', async () => {
      const buf = await makeDocx(); // no footnoteSizeHp option
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v.find((x) => x.code === 'FOOTNOTE_SIZE')).toBeUndefined();
    });

    it('passes when footnote size=20hp (10pt) matches profile', async () => {
      const buf = await makeDocx({ footnoteSizeHp: 20 });
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v.find((x) => x.code === 'FOOTNOTE_SIZE')).toBeUndefined();
    });

    it('flags footnote size=22hp (11pt, required 20hp=10pt)', async () => {
      const buf = await makeDocx({ footnoteSizeHp: 22 });
      const v = await checkDocxFormat(buf, PROFILE);
      const fv = v.find((x) => x.code === 'FOOTNOTE_SIZE');
      expect(fv).toBeDefined();
      expect(fv!.expected).toBe('10 pt');
      expect(fv!.found).toBe('11 pt');
      expect(fv!.messageAr).toMatch(/الحاشية/);
    });
  });
});
