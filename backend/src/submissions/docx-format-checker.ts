import JSZip from 'jszip';
import type { ManuscriptStyleProfile } from '../manuscript-styles/manuscript-style.types';

export interface DocxFormatViolation {
  code: string;
  message: string;
  messageAr: string;
  expected: string;
  found: string;
}

/** 1 mm = 56.693 twips (20 twips per point, 72 points per inch, 25.4 mm per inch) */
const MM_TO_TWIPS = 56.693;
/** Margin tolerance: ±3 mm to allow for different Word rounding */
const MARGIN_TOLERANCE_TWIPS = 3 * MM_TO_TWIPS;

// ── XML helpers ───────────────────────────────────────────────────────────────

function getAttr(element: string, attrName: string): number | null {
  const m = new RegExp(`${attrName}="(\\d+)"`).exec(element);
  return m ? parseInt(m[1], 10) : null;
}

function getStrAttr(element: string, attrName: string): string | null {
  const m = new RegExp(`${attrName}="([^"]+)"`).exec(element);
  return m ? m[1] : null;
}

/** First opening tag matching tagName (self-closing or not). */
function findElement(xml: string, tagName: string): string | null {
  const re = new RegExp(`<${tagName}[\\s][^>]*?/?>`, 's');
  return re.exec(xml)?.[0] ?? null;
}

/** Content between the first open and close tag pair. */
function innerText(xml: string, tagName: string): string | null {
  const re = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 's');
  return re.exec(xml)?.[1] ?? null;
}

/** Full `<w:style …>…</w:style>` block for a given styleId. */
function findStyleBlock(stylesXml: string, styleId: string): string {
  const re = new RegExp(
    `<w:style\\s[^>]*w:styleId="${styleId}"[^>]*>[\\s\\S]*?<\\/w:style>`,
  );
  return re.exec(stylesXml)?.[0] ?? '';
}

// ── Parsers ───────────────────────────────────────────────────────────────────

interface ParsedMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
  header: number;
  footer: number;
}

function parseMargins(documentXml: string): ParsedMargins | null {
  const el = findElement(documentXml, 'w:pgMar');
  if (!el) return null;
  const top = getAttr(el, 'w:top');
  const bottom = getAttr(el, 'w:bottom');
  const left = getAttr(el, 'w:left');
  const right = getAttr(el, 'w:right');
  const header = getAttr(el, 'w:header');
  const footer = getAttr(el, 'w:footer');
  if (
    top === null ||
    bottom === null ||
    left === null ||
    right === null ||
    header === null ||
    footer === null
  )
    return null;
  return { top, bottom, left, right, header, footer };
}

function parseColumnCount(documentXml: string): number {
  const el = findElement(documentXml, 'w:cols');
  return el ? (getAttr(el, 'w:num') ?? 1) : 1;
}

interface ParsedNormalStyle {
  latinFont: string | null;
  arabicFont: string | null;
  latinSizeHp: number | null;
  arabicSizeHp: number | null;
}

function parseNormalStyle(stylesXml: string): ParsedNormalStyle {
  const normalBlock = findStyleBlock(stylesXml, 'Normal');
  const docDefaultsBlock = innerText(stylesXml, 'w:docDefaults') ?? '';

  const rFontsEl =
    findElement(normalBlock, 'w:rFonts') ??
    findElement(docDefaultsBlock, 'w:rFonts');
  const szEl =
    findElement(normalBlock, 'w:sz') ?? findElement(docDefaultsBlock, 'w:sz');
  const szCsEl =
    findElement(normalBlock, 'w:szCs') ??
    findElement(docDefaultsBlock, 'w:szCs');

  return {
    latinFont: rFontsEl
      ? (getStrAttr(rFontsEl, 'w:ascii') ?? getStrAttr(rFontsEl, 'w:hAnsi'))
      : null,
    arabicFont: rFontsEl ? getStrAttr(rFontsEl, 'w:cs') : null,
    latinSizeHp: szEl ? getAttr(szEl, 'w:val') : null,
    arabicSizeHp: szCsEl ? getAttr(szCsEl, 'w:val') : null,
  };
}

interface ParsedSpacing {
  lineTwips: number | null;
  lineRule: string | null;
  beforeTwips: number | null;
  afterTwips: number | null;
}

/**
 * Reads line-spacing and paragraph-spacing from the Normal paragraph style,
 * falling back to docDefaults.  Returns nulls when the document doesn't
 * set a value explicitly (so we can skip that check safely).
 */
function parseParagraphSpacing(stylesXml: string): ParsedSpacing {
  const normalBlock = findStyleBlock(stylesXml, 'Normal');
  const docDefaultsBlock = innerText(stylesXml, 'w:docDefaults') ?? '';

  // Spacing lives inside <w:pPr> in the style, or <w:pPrDefault> in docDefaults
  const normalPpr = innerText(normalBlock, 'w:pPr') ?? '';
  const defaultsPpr = innerText(docDefaultsBlock, 'w:pPrDefault') ?? '';

  const spacingEl =
    findElement(normalPpr, 'w:spacing') ??
    findElement(defaultsPpr, 'w:spacing');

  if (!spacingEl)
    return {
      lineTwips: null,
      lineRule: null,
      beforeTwips: null,
      afterTwips: null,
    };

  return {
    lineTwips: getAttr(spacingEl, 'w:line'),
    lineRule: getStrAttr(spacingEl, 'w:lineRule'),
    beforeTwips: getAttr(spacingEl, 'w:before'),
    afterTwips: getAttr(spacingEl, 'w:after'),
  };
}

/**
 * Returns the half-point size from a style block (checks rPr then pPr).
 * Tries `w:sz` for Latin and, when `cs=true`, `w:szCs` for complex-script.
 */
function parseStyleSize(styleBlock: string, cs = false): number | null {
  const rPr = innerText(styleBlock, 'w:rPr') ?? styleBlock;
  const tag = cs ? 'w:szCs' : 'w:sz';
  const el = findElement(rPr, tag);
  return el ? getAttr(el, 'w:val') : null;
}

/** Extract plain text from Word XML by stripping all tags. */
function extractPlainText(xml: string): string {
  return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

/**
 * Detects dominant citation style from document body text.
 * Returns 'vancouver' for [1]/[1,2] numbered, 'apa' for (Author, Year),
 * or null when fewer than 3 citations found or style is ambiguous.
 */
function detectCitationStyle(documentXml: string): 'vancouver' | 'apa' | null {
  const text = extractPlainText(documentXml);
  const numbered = (text.match(/\[\d[\d,\s–-]*\]/g) ?? []).length;
  const authorYear = (
    text.match(/\([A-ZÀ-Öa-zà-ö][^)]{2,40},\s*\d{4}[a-z]?\)/g) ?? []
  ).length;
  if (numbered + authorYear < 3) return null;
  if (numbered > authorYear * 1.5) return 'vancouver';
  if (authorYear > numbered * 1.5) return 'apa';
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface DocxFormatOptions {
  expectedColumns?: 1 | 2;
  /** 'medical' → require Vancouver; 'engineering'|'other' → require APA; omit → skip */
  discipline?: 'medical' | 'engineering' | 'other';
}

export async function checkDocxFormat(
  buffer: Buffer,
  profile: ManuscriptStyleProfile,
  expectedColumnsOrOpts: 1 | 2 | DocxFormatOptions = 1,
): Promise<DocxFormatViolation[]> {
  const opts: DocxFormatOptions =
    typeof expectedColumnsOrOpts === 'number'
      ? { expectedColumns: expectedColumnsOrOpts }
      : expectedColumnsOrOpts;

  const violations: DocxFormatViolation[] = [];

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return [
      {
        code: 'DOCX_UNREADABLE',
        message: 'The uploaded file could not be read as a Word document',
        messageAr: 'تعذّر قراءة الملف المرفوع كمستند Word',
        expected: '.docx (ZIP+XML)',
        found: 'unreadable',
      },
    ];
  }

  const docFile = zip.file('word/document.xml');
  const stylesFile = zip.file('word/styles.xml');

  if (!docFile || !stylesFile) {
    return [
      {
        code: 'DOCX_MISSING_PARTS',
        message:
          'Word file is missing required internal parts (document.xml or styles.xml)',
        messageAr: 'ملف Word يفتقر إلى أجزاء داخلية مطلوبة',
        expected: 'word/document.xml + word/styles.xml',
        found: 'missing',
      },
    ];
  }

  const [documentXml, stylesXml] = await Promise.all([
    docFile.async('string'),
    stylesFile.async('string'),
  ]);

  // ── §1: Margins ───────────────────────────────────────────────────────────
  const margins = parseMargins(documentXml);
  if (margins) {
    const marginChecks: Array<{
      key: keyof ParsedMargins;
      mm: number;
      label: string;
      labelAr: string;
    }> = [
      {
        key: 'top',
        mm: profile.pageMarginsMm.top,
        label: 'top margin',
        labelAr: 'الهامش العلوي',
      },
      {
        key: 'bottom',
        mm: profile.pageMarginsMm.bottom,
        label: 'bottom margin',
        labelAr: 'الهامش السفلي',
      },
      {
        key: 'left',
        mm: profile.pageMarginsMm.left,
        label: 'left margin',
        labelAr: 'الهامش الأيسر',
      },
      {
        key: 'right',
        mm: profile.pageMarginsMm.right,
        label: 'right margin',
        labelAr: 'الهامش الأيمن',
      },
      {
        key: 'header',
        mm: profile.pageMarginsMm.header,
        label: 'header distance',
        labelAr: 'مسافة الرأسية',
      },
      {
        key: 'footer',
        mm: profile.pageMarginsMm.footer,
        label: 'footer distance',
        labelAr: 'مسافة التذييل',
      },
    ];
    for (const { key, mm, label, labelAr } of marginChecks) {
      const actualTwips = margins[key];
      const expectedTwips = Math.round(mm * MM_TO_TWIPS);
      if (
        !withinTolerance(actualTwips, expectedTwips, MARGIN_TOLERANCE_TWIPS)
      ) {
        const actualMm = Math.round((actualTwips / MM_TO_TWIPS) * 10) / 10;
        violations.push({
          code: `MARGIN_${key.toUpperCase()}`,
          message: `Incorrect ${label}: document has ${actualMm} mm, required ${mm} mm`,
          messageAr: `${labelAr} غير صحيح: الوثيقة تحتوي على ${actualMm} ملم، المطلوب ${mm} ملم`,
          expected: `${mm} mm`,
          found: `${actualMm} mm`,
        });
      }
    }
  }

  // ── §1: Column count ──────────────────────────────────────────────────────
  const expectedColumns = opts.expectedColumns ?? 1;
  const cols = parseColumnCount(documentXml);
  if (cols !== expectedColumns) {
    violations.push({
      code: 'COLUMN_COUNT',
      message: `Incorrect column layout: document has ${cols} column(s), required ${expectedColumns}`,
      messageAr: `تنسيق الأعمدة غير صحيح: الوثيقة تحتوي على ${cols} عمود/أعمدة، المطلوب ${expectedColumns}`,
      expected: `${expectedColumns} column(s)`,
      found: `${cols} column(s)`,
    });
  }

  // ── §1: Line spacing ──────────────────────────────────────────────────────
  const spacing = parseParagraphSpacing(stylesXml);
  const expectedLineTwips = profile.documentLineSpacingTwips; // 240 = single

  if (spacing.lineTwips !== null) {
    if (spacing.lineRule !== null && spacing.lineRule !== 'auto') {
      violations.push({
        code: 'LINE_SPACING_RULE',
        message: `Incorrect line spacing rule: found "${spacing.lineRule}", required "auto" (single spacing)`,
        messageAr: `قاعدة تباعد الأسطر غير صحيحة: تم العثور على "${spacing.lineRule}"، المطلوب "auto" (مفرد)`,
        expected: 'auto',
        found: spacing.lineRule,
      });
    } else if (spacing.lineTwips !== expectedLineTwips) {
      violations.push({
        code: 'LINE_SPACING',
        message: `Incorrect line spacing: found ${spacing.lineTwips} twips, required ${expectedLineTwips} (single)`,
        messageAr: `تباعد الأسطر غير صحيح: تم العثور على ${spacing.lineTwips} twips، المطلوب ${expectedLineTwips} (مفرد)`,
        expected: `${expectedLineTwips} twips (single)`,
        found: `${spacing.lineTwips} twips`,
      });
    }
  }

  // ── §1: Paragraph spacing before/after ────────────────────────────────────
  const expectedParaBefore = profile.documentParagraphSpacing.before; // 0
  const expectedParaAfter = profile.documentParagraphSpacing.after; // 0

  if (
    spacing.beforeTwips !== null &&
    spacing.beforeTwips !== expectedParaBefore
  ) {
    violations.push({
      code: 'PARA_SPACING_BEFORE',
      message: `Incorrect paragraph spacing before: found ${spacing.beforeTwips} twips, required ${expectedParaBefore}`,
      messageAr: `المسافة قبل الفقرة غير صحيحة: تم العثور على ${spacing.beforeTwips} twips، المطلوب ${expectedParaBefore}`,
      expected: `${expectedParaBefore} twips`,
      found: `${spacing.beforeTwips} twips`,
    });
  }
  if (spacing.afterTwips !== null && spacing.afterTwips !== expectedParaAfter) {
    violations.push({
      code: 'PARA_SPACING_AFTER',
      message: `Incorrect paragraph spacing after: found ${spacing.afterTwips} twips, required ${expectedParaAfter}`,
      messageAr: `المسافة بعد الفقرة غير صحيحة: تم العثور على ${spacing.afterTwips} twips، المطلوب ${expectedParaAfter}`,
      expected: `${expectedParaAfter} twips`,
      found: `${spacing.afterTwips} twips`,
    });
  }

  // ── §3: Citation style (APA vs Vancouver) ─────────────────────────────────
  if (opts.discipline) {
    const citationStyle = detectCitationStyle(documentXml);
    const requiresVancouver = opts.discipline === 'medical';
    if (citationStyle !== null) {
      if (requiresVancouver && citationStyle === 'apa') {
        violations.push({
          code: 'CITATION_STYLE',
          message:
            "Detected APA-style (author–year) citations, but 'العلوم الطبية' requires Vancouver (numbered) style per Damascus University §3",
          messageAr:
            "تم اكتشاف أسلوب توثيق APA (مؤلف-سنة)، لكن تخصص 'العلوم الطبية' يستلزم أسلوب Vancouver (مرقّم) وفق §3 جامعة دمشق",
          expected: 'Vancouver [1]',
          found: 'APA (Author, Year)',
        });
      } else if (!requiresVancouver && citationStyle === 'vancouver') {
        const label =
          opts.discipline === 'engineering'
            ? 'العلوم الهندسية'
            : 'non-medical discipline';
        violations.push({
          code: 'CITATION_STYLE',
          message: `Detected Vancouver-style (numbered) citations, but '${label}' requires APA (author–year) style per Damascus University §3`,
          messageAr: `تم اكتشاف أسلوب توثيق Vancouver (مرقّم)، لكن تخصص '${label}' يستلزم أسلوب APA (مؤلف-سنة) وفق §3 جامعة دمشق`,
          expected: 'APA (Author, Year)',
          found: 'Vancouver [1]',
        });
      }
    }
  }

  // ── §2: Body fonts & sizes ────────────────────────────────────────────────
  const normalStyle = parseNormalStyle(stylesXml);

  if (normalStyle.latinFont !== null) {
    const exp = profile.fonts.latin;
    if (normalStyle.latinFont.toLowerCase() !== exp.toLowerCase()) {
      violations.push({
        code: 'FONT_LATIN',
        message: `Incorrect Latin body font: found "${normalStyle.latinFont}", required "${exp}"`,
        messageAr: `خط الجسم اللاتيني غير صحيح: تم العثور على "${normalStyle.latinFont}"، المطلوب "${exp}"`,
        expected: exp,
        found: normalStyle.latinFont,
      });
    }
  }

  if (normalStyle.arabicFont !== null) {
    const exp = profile.fonts.arabic;
    if (normalStyle.arabicFont.toLowerCase() !== exp.toLowerCase()) {
      violations.push({
        code: 'FONT_ARABIC',
        message: `Incorrect Arabic body font: found "${normalStyle.arabicFont}", required "${exp}"`,
        messageAr: `خط الجسم العربي غير صحيح: تم العثور على "${normalStyle.arabicFont}"، المطلوب "${exp}"`,
        expected: exp,
        found: normalStyle.arabicFont,
      });
    }
  }

  if (normalStyle.latinSizeHp !== null) {
    const exp = profile.sizesHalfPoints.bodyLatin;
    if (normalStyle.latinSizeHp !== exp) {
      violations.push({
        code: 'FONT_SIZE_LATIN',
        message: `Incorrect Latin body font size: found ${normalStyle.latinSizeHp / 2} pt, required ${exp / 2} pt`,
        messageAr: `حجم خط الجسم اللاتيني غير صحيح: تم العثور على ${normalStyle.latinSizeHp / 2} نقطة، المطلوب ${exp / 2} نقطة`,
        expected: `${exp / 2} pt`,
        found: `${normalStyle.latinSizeHp / 2} pt`,
      });
    }
  }

  if (normalStyle.arabicSizeHp !== null) {
    const exp = profile.sizesHalfPoints.bodyArabic;
    if (normalStyle.arabicSizeHp !== exp) {
      violations.push({
        code: 'FONT_SIZE_ARABIC',
        message: `Incorrect Arabic body font size: found ${normalStyle.arabicSizeHp / 2} pt, required ${exp / 2} pt`,
        messageAr: `حجم خط الجسم العربي غير صحيح: تم العثور على ${normalStyle.arabicSizeHp / 2} نقطة، المطلوب ${exp / 2} نقطة`,
        expected: `${exp / 2} pt`,
        found: `${normalStyle.arabicSizeHp / 2} pt`,
      });
    }
  }

  // ── §2: Heading sizes ─────────────────────────────────────────────────────
  const headingChecks: Array<{ level: 1 | 2; exp: number; labelAr: string }> = [
    {
      level: 1,
      exp: profile.sizesHalfPoints.heading1,
      labelAr: 'العنوان الرئيسي',
    },
    {
      level: 2,
      exp: profile.sizesHalfPoints.heading2,
      labelAr: 'العنوان الفرعي',
    },
  ];
  for (const { level, exp, labelAr } of headingChecks) {
    // Word styleId is "Heading1"/"Heading2" (English) or "1"/"2" (some locales)
    const hBlock =
      findStyleBlock(stylesXml, `Heading${level}`) ||
      findStyleBlock(stylesXml, String(level));
    if (!hBlock) continue; // style not defined → skip

    const hSize = parseStyleSize(hBlock);
    if (hSize !== null && hSize !== exp) {
      violations.push({
        code: `HEADING${level}_SIZE`,
        message: `Incorrect Heading ${level} font size: found ${hSize / 2} pt, required ${exp / 2} pt`,
        messageAr: `حجم ${labelAr} غير صحيح: تم العثور على ${hSize / 2} نقطة، المطلوب ${exp / 2} نقطة`,
        expected: `${exp / 2} pt`,
        found: `${hSize / 2} pt`,
      });
    }
  }

  // ── §2: Footnote size ─────────────────────────────────────────────────────
  const footnoteBlock =
    findStyleBlock(stylesXml, 'FootnoteText') ||
    findStyleBlock(stylesXml, 'footnote text');
  if (footnoteBlock) {
    const expFootnote =
      profile.footnoteSizeHalfPoints ?? profile.sizesHalfPoints.bodyLatin;
    const fnSize = parseStyleSize(footnoteBlock);
    if (fnSize !== null && fnSize !== expFootnote) {
      violations.push({
        code: 'FOOTNOTE_SIZE',
        message: `Incorrect footnote font size: found ${fnSize / 2} pt, required ${expFootnote / 2} pt`,
        messageAr: `حجم خط الحاشية السفلية غير صحيح: تم العثور على ${fnSize / 2} نقطة، المطلوب ${expFootnote / 2} نقطة`,
        expected: `${expFootnote / 2} pt`,
        found: `${fnSize / 2} pt`,
      });
    }
  }

  return violations;
}

function withinTolerance(
  actual: number,
  expected: number,
  tol: number,
): boolean {
  return Math.abs(actual - expected) <= tol;
}
