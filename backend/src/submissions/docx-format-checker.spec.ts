import { readFileSync } from 'fs';
import { join } from 'path';
import JSZip from 'jszip';
import {
  checkDocxFormat,
  isBlockingDocxViolation,
  type DocxFormatViolation,
} from './docx-format-checker';
import type { ManuscriptStyleProfile } from '../manuscript-styles/manuscript-style.types';
import { damascusUniversityJournalV1 } from '../manuscript-styles/profiles/damascus-university-journal-v1.profile';

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
    title: 32, // 16 pt
    heading1: 28, // 14 pt
    heading2: 28,
    heading3: 28,
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
    heading1: { before: 0, after: 0 },
    heading2: { before: 0, after: 0 },
    heading3: { before: 0, after: 0 },
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

const W_NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

// ── Body builders ────────────────────────────────────────────────────────────

const AR_TEXT = 'تتناول هذه المقالة موضوع البحث وأهدافه بالتفصيل';
const EN_TEXT = 'This article introduces the topic and its objectives';

function para(text: string, opts: { pPr?: string; rPr?: string } = {}) {
  const pPr = opts.pPr ? `<w:pPr>${opts.pPr}</w:pPr>` : '';
  const rPr = opts.rPr ? `<w:rPr>${opts.rPr}</w:rPr>` : '';
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

const TITLE = para('عنوان المقالة', {
  rPr: '<w:b/><w:bCs/><w:sz w:val="32"/><w:szCs w:val="32"/>',
});

/** A compliant Arabic article body: a 16 pt bold title then running text. */
const DEFAULT_BODY = [TITLE, para(AR_TEXT), para(AR_TEXT), para(EN_TEXT)].join(
  '',
);

// ── Docx builder ─────────────────────────────────────────────────────────────

interface MarginOptions {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  header?: number;
  footer?: number;
}

interface SectOptions {
  margins?: MarginOptions | null; // null = omit w:pgMar entirely
  cols?: number | null; // null = omit w:cols; default 1
  titlePg?: boolean; // default true
  lineNumbers?: boolean; // default true
  bidi?: boolean; // default false (Arabic article → numbers on the left)
}

interface StyleOptions {
  latinFont?: string;
  arabicFont?: string;
  latinSizeHp?: number;
  arabicSizeHp?: number;
  /** Put font info in Normal style block instead of docDefaults */
  inNormalStyle?: boolean;
}

interface DocxOptions extends SectOptions {
  /** Paragraph XML placed before the final sectPr. */
  body?: string;
  style?: StyleOptions | null; // null = omit font/size info
  /** Spacing added to Normal style's <w:pPr><w:spacing .../> */
  spacing?: {
    lineTwips?: number;
    lineRule?: string;
    beforeTwips?: number;
    afterTwips?: number;
  } | null;
  /** Adds a Heading1 style (outline level 0) with the given half-point size */
  heading1SizeHp?: number;
  /** Adds a FootnoteText style with the given half-point size */
  footnoteSizeHp?: number;
  /** Raw w:style elements appended to styles.xml */
  extraStyles?: string;
  footnotesXml?: string;
  themeXml?: string;
  omitDocumentXml?: boolean;
  omitStylesXml?: boolean;
}

function sectPr(o: SectOptions = {}): string {
  const m = o.margins;
  const marginLine =
    m === null
      ? ''
      : `<w:pgMar w:top="${m?.top ?? MM(30)}" w:right="${m?.right ?? MM(20)}" ` +
        `w:bottom="${m?.bottom ?? MM(20)}" w:left="${m?.left ?? MM(20)}" ` +
        `w:header="${m?.header ?? MM(18)}" w:footer="${m?.footer ?? MM(6)}" w:gutter="0"/>`;
  const cols = o.cols === undefined ? 1 : o.cols;
  const colsLine =
    cols === null
      ? ''
      : cols === 1
        ? '<w:cols w:space="708"/>'
        : `<w:cols w:num="${cols}" w:space="708"/>`;
  return [
    '<w:sectPr>',
    '<w:pgSz w:w="11906" w:h="16838"/>',
    marginLine,
    o.lineNumbers === false
      ? ''
      : '<w:lnNumType w:countBy="1" w:distance="255" w:restart="continuous"/>',
    colsLine,
    o.titlePg === false ? '' : '<w:titlePg/>',
    o.bidi ? '<w:bidi/>' : '',
    '</w:sectPr>',
  ].join('');
}

function buildDocumentXml(opts: DocxOptions): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W_NS}>
  <w:body>
    ${opts.body ?? DEFAULT_BODY}
    ${sectPr(opts)}
  </w:body>
</w:document>`;
}

function buildFontBlock(s: StyleOptions): string {
  return [
    `<w:rFonts w:ascii="${s.latinFont}" w:hAnsi="${s.latinFont}" w:cs="${s.arabicFont}"/>`,
    `<w:sz w:val="${s.latinSizeHp}"/>`,
    `<w:szCs w:val="${s.arabicSizeHp}"/>`,
  ].join('');
}

function buildStylesXml(opts: DocxOptions): string {
  const extraStyles: string[] = [opts.extraStyles ?? ''];
  if (opts.heading1SizeHp !== undefined) {
    const hp = opts.heading1SizeHp;
    extraStyles.push(
      `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>` +
        `<w:pPr><w:outlineLvl w:val="0"/></w:pPr>` +
        `<w:rPr><w:b/><w:bCs/><w:sz w:val="${hp}"/><w:szCs w:val="${hp}"/></w:rPr></w:style>`,
    );
  }
  if (opts.footnoteSizeHp !== undefined) {
    extraStyles.push(
      `<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/><w:basedOn w:val="Normal"/>` +
        `<w:rPr><w:sz w:val="${opts.footnoteSizeHp}"/><w:szCs w:val="${opts.footnoteSizeHp}"/></w:rPr></w:style>`,
    );
  }

  if (opts.style === null) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W_NS}>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>
  ${extraStyles.join('')}
</w:styles>`;
  }

  const fontBlock = buildFontBlock({
    latinFont: opts.style?.latinFont ?? 'Times New Roman',
    arabicFont: opts.style?.arabicFont ?? 'Simplified Arabic',
    latinSizeHp: opts.style?.latinSizeHp ?? 22,
    arabicSizeHp: opts.style?.arabicSizeHp ?? 24,
  });

  const s = opts.spacing;
  const spacingAttr = s
    ? [
        s.lineTwips !== undefined ? `w:line="${s.lineTwips}"` : '',
        s.lineRule !== undefined ? `w:lineRule="${s.lineRule}"` : '',
        s.beforeTwips !== undefined ? `w:before="${s.beforeTwips}"` : '',
        s.afterTwips !== undefined ? `w:after="${s.afterTwips}"` : '',
      ]
        .filter(Boolean)
        .join(' ')
    : '';
  const normalPpr = spacingAttr
    ? `<w:pPr><w:spacing ${spacingAttr}/></w:pPr>`
    : '';

  if (opts.style?.inNormalStyle) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W_NS}>
  <w:docDefaults/>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>${normalPpr}<w:rPr>${fontBlock}</w:rPr>
  </w:style>
  ${extraStyles.join('')}
</w:styles>`;
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W_NS}>
  <w:docDefaults><w:rPrDefault><w:rPr>${fontBlock}</w:rPr></w:rPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>${normalPpr}
  </w:style>
  ${extraStyles.join('')}
</w:styles>`;
}

async function makeDocx(opts: DocxOptions = {}): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
</Types>`,
  );
  if (!opts.omitDocumentXml) {
    zip.file('word/document.xml', buildDocumentXml(opts));
  }
  if (!opts.omitStylesXml) {
    zip.file('word/styles.xml', buildStylesXml(opts));
  }
  if (opts.footnotesXml) zip.file('word/footnotes.xml', opts.footnotesXml);
  if (opts.themeXml) zip.file('word/theme/theme1.xml', opts.themeXml);
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
}

const codes = (v: DocxFormatViolation[]) => v.map((x) => x.code);
const blocking = (v: DocxFormatViolation[]) =>
  v.filter(isBlockingDocxViolation);

// ─────────────────────────────────────────────────────────────────────────────

describe('checkDocxFormat', () => {
  // ── Error cases ─────────────────────────────────────────────────────────────

  describe('error cases', () => {
    it('returns DOCX_UNREADABLE for a non-ZIP buffer', async () => {
      const buf = Buffer.from('this is plain text, not a zip');
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v).toHaveLength(1);
      expect(v[0].code).toBe('DOCX_UNREADABLE');
      expect(v[0].severity).toBe('error');
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
      const v = await checkDocxFormat(await makeDocx(), PROFILE);
      expect(v).toEqual([]);
    });

    it('passes when fonts are in the Normal style block (not docDefaults)', async () => {
      const buf = await makeDocx({ style: { inNormalStyle: true } });
      expect(await checkDocxFormat(buf, PROFILE)).toEqual([]);
    });

    it('passes when font names match case-insensitively', async () => {
      const buf = await makeDocx({
        style: {
          latinFont: 'TIMES NEW ROMAN',
          arabicFont: 'simplified arabic',
        },
      });
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v.filter((x) => x.code.startsWith('FONT'))).toHaveLength(0);
    });

    it('passes margins within the ±3 mm tolerance', async () => {
      const buf = await makeDocx({
        margins: { top: MM(28), bottom: MM(22) },
      });
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v.filter((x) => x.code.startsWith('MARGIN'))).toHaveLength(0);
    });

    it('skips margin check when w:pgMar is absent', async () => {
      const buf = await makeDocx({ margins: null });
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v.filter((x) => x.code.startsWith('MARGIN'))).toHaveLength(0);
    });

    it('skips font checks when no font or size is set anywhere', async () => {
      const buf = await makeDocx({
        style: null,
        body: [para('عنوان'), para(AR_TEXT), para(EN_TEXT)].join(''),
      });
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v.filter((x) => x.code.startsWith('FONT'))).toHaveLength(0);
    });

    it('defaults to 1 column when w:cols element is absent', async () => {
      const buf = await makeDocx({ cols: null });
      const v = await checkDocxFormat(buf, PROFILE, 1);
      expect(codes(v)).not.toContain('COLUMN_COUNT');
    });

    it('accepts the exact twip values Word uses for Damascus University margins', async () => {
      // Word rounds 30mm → 1701, 20mm → 1134, 18mm → 1021, 6mm → 340
      const buf = await makeDocx({
        margins: {
          top: 1701,
          right: 1134,
          bottom: 1134,
          left: 1134,
          header: 1021,
          footer: 340,
        },
      });
      expect(await checkDocxFormat(buf, PROFILE)).toEqual([]);
    });
  });

  // ── The journal's own template ──────────────────────────────────────────────

  describe('official Damascus University author template', () => {
    const template = readFileSync(
      join(__dirname, '__fixtures__', 'damascus-author-template.docx'),
    );

    it('is not blocked by its own formatting rules', async () => {
      // Its Normal style is Palatino "at least 13 pt" and docDefaults are Calibri —
      // the real formatting is applied directly to the text.
      const v = await checkDocxFormat(template, damascusUniversityJournalV1);
      expect(blocking(v)).toEqual([]);
    });

    it('measures its running text as Simplified Arabic 12 / single spacing', async () => {
      const v = await checkDocxFormat(template, damascusUniversityJournalV1);
      expect(codes(v)).not.toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^(FONT|LINE_SPACING|PARA_SPACING|MARGIN)/),
        ]),
      );
      expect(codes(v)).not.toContain('LINE_NUMBERS_MISSING');
      expect(codes(v)).not.toContain('DIFFERENT_FIRST_PAGE');
    });
  });

  // ── Measuring the formatting Word applies ───────────────────────────────────

  describe('measures applied formatting, not just style defaults', () => {
    it('lets direct run and paragraph formatting override the Normal style', async () => {
      const direct =
        '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Simplified Arabic"/>' +
        '<w:sz w:val="22"/><w:szCs w:val="24"/>';
      const single =
        '<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>';
      const buf = await makeDocx({
        style: {
          latinFont: 'Palatino Linotype',
          arabicFont: 'Times New Roman',
          latinSizeHp: 18,
          arabicSizeHp: 22,
        },
        spacing: { lineTwips: 260, lineRule: 'atLeast', afterTwips: 200 },
        body: [
          TITLE,
          para(AR_TEXT, { pPr: single, rPr: direct }),
          para(AR_TEXT, { pPr: single, rPr: direct }),
          para(EN_TEXT, { pPr: single, rPr: direct }),
        ].join(''),
      });
      expect(await checkDocxFormat(buf, PROFILE)).toEqual([]);
    });

    it('ignores text inside tables and text boxes', async () => {
      const arial =
        '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="16"/><w:szCs w:val="16"/>';
      const boxed = Array.from({ length: 10 }, () =>
        para(`${AR_TEXT} ${EN_TEXT}`, { rPr: arial }),
      ).join('');
      const buf = await makeDocx({
        body:
          DEFAULT_BODY +
          `<w:tbl><w:tr><w:tc>${boxed}</w:tc></w:tr></w:tbl>` +
          `<w:p><w:r><w:drawing><w:txbxContent>${boxed}</w:txbxContent></w:drawing></w:r></w:p>`,
      });
      expect(await checkDocxFormat(buf, PROFILE)).toEqual([]);
    });

    it('treats Latin letters in an rtl run as complex-script text', async () => {
      const buf = await makeDocx({
        body: [
          TITLE,
          para(AR_TEXT),
          para(EN_TEXT, {
            rPr: '<w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:rtl/>',
          }),
        ].join(''),
      });
      expect(codes(await checkDocxFormat(buf, PROFILE))).not.toContain(
        'FONT_LATIN',
      );
    });

    it('resolves theme fonts from theme1.xml', async () => {
      const theme = (arab: string) =>
        `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:fontScheme name="t">` +
        `<a:majorFont><a:latin typeface="Calibri Light"/><a:cs typeface=""/></a:majorFont>` +
        `<a:minorFont><a:latin typeface="Times New Roman"/><a:cs typeface=""/><a:font script="Arab" typeface="${arab}"/></a:minorFont>` +
        `</a:fontScheme></a:themeElements></a:theme>`;
      const themed =
        '<w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi" w:cstheme="minorBidi"/>';
      const body = [
        TITLE,
        para(AR_TEXT, { rPr: themed }),
        para(AR_TEXT, { rPr: themed }),
        para(EN_TEXT, { rPr: themed }),
      ].join('');

      const ok = await makeDocx({ body, themeXml: theme('Simplified Arabic') });
      expect(await checkDocxFormat(ok, PROFILE)).toEqual([]);

      const wrong = await makeDocx({ body, themeXml: theme('Arial') });
      const fv = (await checkDocxFormat(wrong, PROFILE)).find(
        (x) => x.code === 'FONT_ARABIC',
      );
      expect(fv?.found).toBe('Arial');
    });

    it('ignores superseded formatting recorded in tracked changes', async () => {
      const buf = await makeDocx({
        body: [
          TITLE,
          para(AR_TEXT),
          para(AR_TEXT),
          para(EN_TEXT, {
            rPr: '<w:sz w:val="22"/><w:rPrChange w:id="1" w:author="x"><w:rPr><w:sz w:val="40"/></w:rPr></w:rPrChange>',
          }),
        ].join(''),
      });
      expect(await checkDocxFormat(buf, PROFILE)).toEqual([]);
    });

    it('judges the section holding most of the text (1-column title block, 2-column body)', async () => {
      const titleSection = `<w:p><w:pPr><w:sectPr><w:pgMar w:top="${MM(30)}" w:right="${MM(20)}" w:bottom="${MM(20)}" w:left="${MM(20)}" w:header="${MM(18)}" w:footer="${MM(6)}"/><w:cols w:space="708"/><w:titlePg/><w:type w:val="continuous"/></w:sectPr></w:pPr></w:p>`;
      const buf = await makeDocx({
        cols: 2,
        body:
          TITLE +
          titleSection +
          DEFAULT_BODY.replace(TITLE, '') +
          para(AR_TEXT),
      });
      const v = await checkDocxFormat(buf, PROFILE, { expectedColumns: 2 });
      expect(codes(v)).not.toContain('COLUMN_COUNT');
      expect(v).toEqual([]);
    });
  });

  // ── Severity ────────────────────────────────────────────────────────────────

  describe('severity', () => {
    it('blocks on page margins but only warns on header/footer distance', async () => {
      const buf = await makeDocx({
        margins: { top: MM(20), header: MM(30), footer: MM(30) },
      });
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v.find((x) => x.code === 'MARGIN_TOP')?.severity).toBe('error');
      expect(v.find((x) => x.code === 'MARGIN_HEADER')?.severity).toBe(
        'warning',
      );
      expect(v.find((x) => x.code === 'MARGIN_FOOTER')?.severity).toBe(
        'warning',
      );
    });

    it('isBlockingDocxViolation treats legacy rows without severity as blocking', () => {
      const base = {
        code: 'X',
        message: 'm',
        messageAr: 'm',
        expected: 'e',
        found: 'f',
      };
      expect(isBlockingDocxViolation(base)).toBe(true);
      expect(isBlockingDocxViolation({ ...base, severity: 'error' })).toBe(
        true,
      );
      expect(isBlockingDocxViolation({ ...base, severity: 'warning' })).toBe(
        false,
      );
    });
  });

  // ── Margin violations ───────────────────────────────────────────────────────

  describe('margin violations', () => {
    it('reports MARGIN_TOP when top margin is too large', async () => {
      const buf = await makeDocx({ margins: { top: MM(44) } });
      const mv = (await checkDocxFormat(buf, PROFILE)).find(
        (x) => x.code === 'MARGIN_TOP',
      );
      expect(mv).toBeDefined();
      expect(mv!.expected).toBe('30 mm');
      expect(mv!.message).toMatch(/top margin/);
      expect(mv!.messageAr).toMatch(/الهامش العلوي/);
    });

    it('reports MARGIN_BOTTOM when bottom margin is too small', async () => {
      const buf = await makeDocx({ margins: { bottom: MM(10) } });
      const mv = (await checkDocxFormat(buf, PROFILE)).find(
        (x) => x.code === 'MARGIN_BOTTOM',
      );
      expect(mv?.expected).toBe('20 mm');
    });

    it.each([
      ['MARGIN_LEFT', { left: MM(25) }],
      ['MARGIN_RIGHT', { right: MM(35) }],
      ['MARGIN_HEADER', { header: MM(25) }],
      ['MARGIN_FOOTER', { footer: MM(15) }],
    ])('reports %s', async (code, margins) => {
      const buf = await makeDocx({ margins });
      expect(codes(await checkDocxFormat(buf, PROFILE))).toContain(code);
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
      expect(codes(await checkDocxFormat(buf, PROFILE))).toEqual(
        expect.arrayContaining([
          'MARGIN_TOP',
          'MARGIN_BOTTOM',
          'MARGIN_LEFT',
          'MARGIN_RIGHT',
          'MARGIN_HEADER',
          'MARGIN_FOOTER',
        ]),
      );
    });

    it('does not flag a margin that is exactly 3 mm off (at tolerance boundary)', async () => {
      const buf = await makeDocx({ margins: { top: MM(27) } });
      expect(codes(await checkDocxFormat(buf, PROFILE))).not.toContain(
        'MARGIN_TOP',
      );
    });

    it('flags a margin that is 4 mm off (just outside tolerance)', async () => {
      const buf = await makeDocx({ margins: { top: MM(26) } });
      expect(codes(await checkDocxFormat(buf, PROFILE))).toContain(
        'MARGIN_TOP',
      );
    });

    it('violation message includes actual and expected mm values', async () => {
      const buf = await makeDocx({ margins: { top: MM(25) } });
      const mv = (await checkDocxFormat(buf, PROFILE)).find(
        (x) => x.code === 'MARGIN_TOP',
      )!;
      expect(mv.message).toMatch(/25/);
      expect(mv.message).toMatch(/30/);
    });

    it('flags typical Microsoft Word default margins (2.54cm = 1440 twips)', async () => {
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
      expect(codes(await checkDocxFormat(buf, PROFILE))).toEqual(
        expect.arrayContaining([
          'MARGIN_TOP',
          'MARGIN_HEADER',
          'MARGIN_FOOTER',
        ]),
      );
    });
  });

  // ── Column count ────────────────────────────────────────────────────────────

  describe('column count violations', () => {
    it('reports COLUMN_COUNT when document has 2 columns but 1 expected', async () => {
      const buf = await makeDocx({ cols: 2 });
      const cv = (await checkDocxFormat(buf, PROFILE, 1)).find(
        (x) => x.code === 'COLUMN_COUNT',
      );
      expect(cv).toBeDefined();
      expect(cv!.severity).toBe('error');
      expect(cv!.expected).toBe('1 column(s)');
      expect(cv!.found).toBe('2 column(s)');
      expect(cv!.messageAr).toMatch(/الأعمدة/);
    });

    it('reports COLUMN_COUNT when document has 1 column but 2 expected', async () => {
      const buf = await makeDocx({ cols: 1 });
      const cv = (
        await checkDocxFormat(buf, PROFILE, { expectedColumns: 2 })
      ).find((x) => x.code === 'COLUMN_COUNT');
      expect(cv?.expected).toBe('2 column(s)');
      expect(cv?.found).toBe('1 column(s)');
    });

    it('passes when 2-column document is checked against expectedColumns=2', async () => {
      const buf = await makeDocx({ cols: 2 });
      expect(await checkDocxFormat(buf, PROFILE, 2)).toEqual([]);
    });
  });

  // ── Font violations ─────────────────────────────────────────────────────────

  describe('font violations', () => {
    it('reports FONT_LATIN when Latin font is wrong', async () => {
      const buf = await makeDocx({ style: { latinFont: 'Arial' } });
      const fv = (await checkDocxFormat(buf, PROFILE)).find(
        (x) => x.code === 'FONT_LATIN',
      );
      expect(fv).toBeDefined();
      expect(fv!.severity).toBe('error');
      expect(fv!.expected).toBe('Times New Roman');
      expect(fv!.found).toBe('Arial');
      expect(fv!.messageAr).toMatch(/اللاتيني/);
    });

    it('reports FONT_ARABIC when Arabic font is wrong', async () => {
      const buf = await makeDocx({ style: { arabicFont: 'Arial' } });
      const fv = (await checkDocxFormat(buf, PROFILE)).find(
        (x) => x.code === 'FONT_ARABIC',
      );
      expect(fv).toBeDefined();
      expect(fv!.expected).toBe('Simplified Arabic');
      expect(fv!.found).toBe('Arial');
      expect(fv!.messageAr).toMatch(/العربي/);
    });

    it('reports FONT_SIZE_LATIN when Latin size is wrong (12pt instead of 11pt)', async () => {
      const buf = await makeDocx({ style: { latinSizeHp: 24 } });
      const fv = (await checkDocxFormat(buf, PROFILE)).find(
        (x) => x.code === 'FONT_SIZE_LATIN',
      );
      expect(fv!.expected).toBe('11 pt');
      expect(fv!.found).toBe('12 pt');
    });

    it('reports FONT_SIZE_ARABIC when Arabic size is wrong (11pt instead of 12pt)', async () => {
      const buf = await makeDocx({ style: { arabicSizeHp: 22 } });
      const fv = (await checkDocxFormat(buf, PROFILE)).find(
        (x) => x.code === 'FONT_SIZE_ARABIC',
      );
      expect(fv!.expected).toBe('12 pt');
      expect(fv!.found).toBe('11 pt');
    });

    it('reports all four font violations simultaneously', async () => {
      const buf = await makeDocx({
        style: {
          latinFont: 'Calibri',
          arabicFont: 'Tahoma',
          latinSizeHp: 24,
          arabicSizeHp: 20,
        },
      });
      expect(codes(await checkDocxFormat(buf, PROFILE))).toEqual(
        expect.arrayContaining([
          'FONT_LATIN',
          'FONT_ARABIC',
          'FONT_SIZE_LATIN',
          'FONT_SIZE_ARABIC',
        ]),
      );
    });

    it('detects fonts in Normal style block (inNormalStyle=true)', async () => {
      const buf = await makeDocx({
        style: { latinFont: 'Calibri', inNormalStyle: true },
      });
      const v = codes(await checkDocxFormat(buf, PROFILE));
      expect(v).toContain('FONT_LATIN');
      expect(v).not.toContain('FONT_ARABIC');
    });

    it('does not judge a script that barely appears in the article', async () => {
      const buf = await makeDocx({
        style: { latinFont: 'Arial' },
        body: [TITLE, para(AR_TEXT), para(AR_TEXT), para('SPSS')].join(''),
      });
      expect(codes(await checkDocxFormat(buf, PROFILE))).not.toContain(
        'FONT_LATIN',
      );
    });
  });

  describe('combined violations', () => {
    it('reports margin + column + font violations together, each fully described', async () => {
      const buf = await makeDocx({
        margins: { top: MM(25) },
        cols: 2,
        style: { latinFont: 'Calibri' },
      });
      const v = await checkDocxFormat(buf, PROFILE, 1);
      expect(codes(v)).toEqual(
        expect.arrayContaining(['MARGIN_TOP', 'COLUMN_COUNT', 'FONT_LATIN']),
      );
      for (const violation of v) {
        expect(violation.code).toBeTruthy();
        expect(violation.message).toBeTruthy();
        expect(violation.messageAr).toBeTruthy();
        expect(violation.expected).toBeTruthy();
        expect(violation.found).toBeTruthy();
        expect(['error', 'warning']).toContain(violation.severity);
      }
    });
  });

  // ── Citation style: APA vs Vancouver (advisory) ─────────────────────────────

  describe('citation style', () => {
    const VANCOUVER_CITES = ['[1]', '[2]', '[3,4]', '[5]'];
    const APA_CITES = [
      '(Smith, 2020)',
      '(Jones, 2019)',
      '(Ali et al., 2021)',
      '(Chen, 2022)',
    ];
    const withCites = (cites: string[]) =>
      makeDocx({ body: DEFAULT_BODY + cites.map((c) => para(c)).join('') });

    it('skips citation check when no citation style is provided', async () => {
      const v = await checkDocxFormat(await withCites(APA_CITES), PROFILE);
      expect(codes(v)).not.toContain('CITATION_STYLE');
    });

    it('skips citation check when fewer than 3 citations found', async () => {
      const v = await checkDocxFormat(
        await withCites(['[1]', '[2]']),
        PROFILE,
        {
          citationStyle: 'vancouver',
        },
      );
      expect(codes(v)).not.toContain('CITATION_STYLE');
    });

    it('passes a Vancouver journal with numbered citations', async () => {
      const v = await checkDocxFormat(
        await withCites(VANCOUVER_CITES),
        PROFILE,
        {
          expectedColumns: 1,
          citationStyle: 'vancouver',
        },
      );
      expect(v).toEqual([]);
    });

    it('warns (does not block) when a Vancouver journal uses APA citations', async () => {
      const v = await checkDocxFormat(await withCites(APA_CITES), PROFILE, {
        citationStyle: 'vancouver',
      });
      const cv = v.find((x) => x.code === 'CITATION_STYLE');
      expect(cv).toBeDefined();
      expect(cv!.severity).toBe('warning');
      expect(cv!.expected).toBe('Vancouver [1]');
      expect(cv!.found).toBe('APA (Author, Year)');
      expect(cv!.messageAr).toMatch(/Vancouver/);
    });

    it('detects Arabic author–year citations for a Vancouver journal', async () => {
      const v = await checkDocxFormat(
        await withCites([
          '(المقدسي، 2020)',
          '(الحسن وآخرون، 2019)',
          '(سليمان، 2021)',
        ]),
        PROFILE,
        { citationStyle: 'vancouver' },
      );
      expect(codes(v)).toContain('CITATION_STYLE');
    });

    it('passes an APA journal with author–year citations in two columns', async () => {
      const buf = await makeDocx({
        cols: 2,
        body: DEFAULT_BODY + APA_CITES.map((c) => para(c)).join(''),
      });
      const v = await checkDocxFormat(buf, PROFILE, {
        expectedColumns: 2,
        citationStyle: 'apa',
      });
      expect(v).toEqual([]);
    });

    it('warns when an APA journal uses numbered citations', async () => {
      const v = await checkDocxFormat(
        await withCites(VANCOUVER_CITES),
        PROFILE,
        {
          citationStyle: 'apa',
        },
      );
      const cv = v.find((x) => x.code === 'CITATION_STYLE');
      expect(cv?.severity).toBe('warning');
      expect(cv?.expected).toBe('APA (Author, Year)');
      expect(cv?.messageAr).toMatch(/APA/);
    });
  });

  // ── Line spacing ──────────────────────────────────────────────────────────

  describe('line spacing', () => {
    it('passes when spacing element is absent (defaults to single)', async () => {
      const v = await checkDocxFormat(await makeDocx(), PROFILE);
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
      const lv = (await checkDocxFormat(buf, PROFILE)).find(
        (x) => x.code === 'LINE_SPACING',
      );
      expect(lv).toBeDefined();
      expect(lv!.severity).toBe('error');
      expect(lv!.expected).toContain('240');
      expect(lv!.found).toContain('480');
      expect(lv!.messageAr).toMatch(/تباعد/);
    });

    it.each(['exact', 'atLeast'])('flags lineRule="%s"', async (lineRule) => {
      const buf = await makeDocx({ spacing: { lineTwips: 240, lineRule } });
      expect(codes(await checkDocxFormat(buf, PROFILE))).toContain(
        'LINE_SPACING_RULE',
      );
    });

    it('uses the spacing most of the text has, not the odd paragraph', async () => {
      const wide = '<w:spacing w:line="480" w:lineRule="auto"/>';
      const buf = await makeDocx({
        body: DEFAULT_BODY + para('ملاحظة', { pPr: wide }),
      });
      expect(await checkDocxFormat(buf, PROFILE)).toEqual([]);
    });
  });

  // ── Paragraph spacing before/after ───────────────────────────────────────

  describe('paragraph spacing before/after', () => {
    it('passes when before=0 and after=0', async () => {
      const buf = await makeDocx({
        spacing: { beforeTwips: 0, afterTwips: 0 },
      });
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v.find((x) => x.code.startsWith('PARA_SPACING'))).toBeUndefined();
    });

    it('flags spacing after=160 (Word default 8pt)', async () => {
      const buf = await makeDocx({ spacing: { afterTwips: 160 } });
      const pv = (await checkDocxFormat(buf, PROFILE)).find(
        (x) => x.code === 'PARA_SPACING_AFTER',
      );
      expect(pv).toBeDefined();
      expect(pv!.expected).toBe('0 twips');
      expect(pv!.found).toBe('160 twips');
      expect(pv!.messageAr).toMatch(/بعد الفقرة/);
    });

    it('flags spacing before=200', async () => {
      const buf = await makeDocx({ spacing: { beforeTwips: 200 } });
      const pv = (await checkDocxFormat(buf, PROFILE)).find(
        (x) => x.code === 'PARA_SPACING_BEFORE',
      );
      expect(pv!.found).toBe('200 twips');
      expect(pv!.messageAr).toMatch(/قبل الفقرة/);
    });

    it('flags both before and after when both wrong', async () => {
      const buf = await makeDocx({
        spacing: { beforeTwips: 100, afterTwips: 200 },
      });
      expect(codes(await checkDocxFormat(buf, PROFILE))).toEqual(
        expect.arrayContaining(['PARA_SPACING_BEFORE', 'PARA_SPACING_AFTER']),
      );
    });
  });

  // ── Title and subheadings ─────────────────────────────────────────────────

  describe('title and subheadings', () => {
    const heading = (text: string) =>
      para(text, { pPr: '<w:pStyle w:val="Heading1"/>' });

    it('passes a 16 pt bold title and 14 pt subheadings', async () => {
      const buf = await makeDocx({
        heading1SizeHp: 28,
        body: DEFAULT_BODY + heading('المقدمة') + para(AR_TEXT),
      });
      expect(await checkDocxFormat(buf, PROFILE)).toEqual([]);
    });

    it('warns when the main title is not 16 pt', async () => {
      const buf = await makeDocx({
        body: DEFAULT_BODY.replace(
          TITLE,
          para('عنوان المقالة', { rPr: '<w:b/><w:bCs/><w:szCs w:val="24"/>' }),
        ),
      });
      const tv = (await checkDocxFormat(buf, PROFILE)).find(
        (x) => x.code === 'TITLE_SIZE',
      );
      expect(tv?.severity).toBe('warning');
      expect(tv?.expected).toBe('16 pt');
      expect(tv?.found).toBe('12 pt');
      expect(tv?.messageAr).toMatch(/العنوان الرئيسي/);
    });

    it('warns when the main title is not bold', async () => {
      const buf = await makeDocx({
        body: DEFAULT_BODY.replace(
          TITLE,
          para('عنوان المقالة', { rPr: '<w:szCs w:val="32"/>' }),
        ),
      });
      expect(codes(await checkDocxFormat(buf, PROFILE))).toContain(
        'TITLE_NOT_BOLD',
      );
    });

    it('warns when subheadings are not 14 pt', async () => {
      const buf = await makeDocx({
        heading1SizeHp: 24,
        body: DEFAULT_BODY + heading('المقدمة') + para(AR_TEXT),
      });
      const hv = (await checkDocxFormat(buf, PROFILE)).find(
        (x) => x.code === 'HEADING_SIZE',
      );
      expect(hv?.severity).toBe('warning');
      expect(hv?.expected).toBe('14 pt');
      expect(hv?.found).toBe('12 pt');
      expect(hv?.messageAr).toMatch(/العناوين الفرعية/);
    });
  });

  // ── Footnote size ─────────────────────────────────────────────────────────

  describe('footnote size', () => {
    const footnotes = `<w:footnotes ${W_NS}>
      <w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>
      <w:footnote w:id="1"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr>
        <w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteRef/></w:r>
        <w:r><w:t xml:space="preserve"> ${EN_TEXT}</w:t></w:r></w:p></w:footnote>
    </w:footnotes>`;

    it('skips footnote check when the document has no footnotes', async () => {
      const buf = await makeDocx({ footnoteSizeHp: 22 });
      expect(codes(await checkDocxFormat(buf, PROFILE))).not.toContain(
        'FOOTNOTE_SIZE',
      );
    });

    it('passes 10 pt footnote text', async () => {
      const buf = await makeDocx({
        footnoteSizeHp: 20,
        footnotesXml: footnotes,
      });
      expect(await checkDocxFormat(buf, PROFILE)).toEqual([]);
    });

    it('warns on 11 pt footnote text', async () => {
      const buf = await makeDocx({
        footnoteSizeHp: 22,
        footnotesXml: footnotes,
      });
      const fv = (await checkDocxFormat(buf, PROFILE)).find(
        (x) => x.code === 'FOOTNOTE_SIZE',
      );
      expect(fv?.severity).toBe('warning');
      expect(fv?.expected).toBe('10 pt');
      expect(fv?.found).toBe('11 pt');
      expect(fv?.messageAr).toMatch(/الحاشية/);
    });
  });

  // ── Header/footer and line numbering ──────────────────────────────────────

  describe('first page and line numbering', () => {
    it('warns when "Different First Page" is off', async () => {
      const buf = await makeDocx({ titlePg: false });
      const v = await checkDocxFormat(buf, PROFILE);
      expect(v.find((x) => x.code === 'DIFFERENT_FIRST_PAGE')?.severity).toBe(
        'warning',
      );
    });

    it('warns when lines are not numbered', async () => {
      const buf = await makeDocx({ lineNumbers: false });
      const lv = (await checkDocxFormat(buf, PROFILE)).find(
        (x) => x.code === 'LINE_NUMBERS_MISSING',
      );
      expect(lv?.severity).toBe('warning');
      expect(lv?.expected).toBe('line numbers (left)');
    });

    it('warns when an Arabic article numbers lines on the right (RTL section)', async () => {
      const buf = await makeDocx({ bidi: true });
      const lv = (await checkDocxFormat(buf, PROFILE)).find(
        (x) => x.code === 'LINE_NUMBERS_SIDE',
      );
      expect(lv?.expected).toBe('left');
      expect(lv?.found).toBe('right');
    });

    it('expects line numbers on the right for an English article', async () => {
      const english = [
        para('Article Title', { rPr: '<w:b/><w:sz w:val="32"/>' }),
        para(EN_TEXT),
        para(EN_TEXT),
      ].join('');
      const ltr = await makeDocx({ body: english });
      expect(
        (await checkDocxFormat(ltr, PROFILE)).find(
          (x) => x.code === 'LINE_NUMBERS_SIDE',
        )?.expected,
      ).toBe('right');

      const rtl = await makeDocx({ body: english, bidi: true });
      expect(await checkDocxFormat(rtl, PROFILE)).toEqual([]);
    });
  });
});
