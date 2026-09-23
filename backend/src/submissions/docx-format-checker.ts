import JSZip from 'jszip';
import type { CitationStyle } from '../manuscript-styles/citation-style';
import type { ManuscriptStyleProfile } from '../manuscript-styles/manuscript-style.types';

/**
 * `error` blocks submission; `warning` is shown to the author but does not.
 */
export type DocxFormatSeverity = 'error' | 'warning';

export interface DocxFormatViolation {
  code: string;
  message: string;
  messageAr: string;
  expected: string;
  found: string;
  /**
   * Always set by {@link checkDocxFormat}. Absent on rows persisted before
   * severities existed — {@link isBlockingDocxViolation} treats those as errors.
   */
  severity?: DocxFormatSeverity;
}

export function isBlockingDocxViolation(v: DocxFormatViolation): boolean {
  return v.severity !== 'warning';
}

/** 1 mm = 56.693 twips (20 twips per point, 72 points per inch, 25.4 mm per inch) */
const MM_TO_TWIPS = 56.693;
/** Margin tolerance: ±3 mm to allow for different Word rounding */
const MARGIN_TOLERANCE_TWIPS = 3 * MM_TO_TWIPS;
/** Word's built-in single spacing: `w:line="240" w:lineRule="auto"`. */
const SINGLE_LINE_TWIPS = 240;
/** Below this many letters a script is incidental and its font is not judged. */
const MIN_SCRIPT_SAMPLE = 20;

// ── XML helpers ───────────────────────────────────────────────────────────────

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m?.[1];
}

function numAttr(tag: string, name: string): number | undefined {
  const v = attr(tag, name);
  if (v === undefined) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

/** First opening tag `<w:name …>` / `<w:name/>` (not a longer name sharing the prefix). */
function firstTag(xml: string, name: string): string | undefined {
  return new RegExp(`<${name}(?=[\\s/>])[^>]*>`).exec(xml)?.[0];
}

/** OOXML on/off element: present without `w:val`, or with a truthy `w:val`. */
function onOff(xml: string, name: string): boolean | undefined {
  const tag = firstTag(xml, name);
  if (!tag) return undefined;
  const v = attr(tag, 'w:val');
  return v === undefined || !['0', 'false', 'off'].includes(v);
}

function stripElement(xml: string, name: string): string {
  return xml.replace(
    new RegExp(`<${name}(?=[\\s>])[^>]*>[\\s\\S]*?</${name}>`, 'g'),
    '',
  );
}

function innerOf(xml: string, name: string): string | undefined {
  return new RegExp(`<${name}(?=[\\s>])[^>]*>([\\s\\S]*?)</${name}>`).exec(
    xml,
  )?.[1];
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// ── Formatting model ──────────────────────────────────────────────────────────

interface RunProps {
  ascii?: string;
  hAnsi?: string;
  cs?: string;
  asciiTheme?: string;
  hAnsiTheme?: string;
  csTheme?: string;
  sz?: number;
  szCs?: number;
  b?: boolean;
  bCs?: boolean;
  /** `w:rtl` or `w:cs` — the whole run takes complex-script formatting. */
  complexScript?: boolean;
  superscript?: boolean;
}

interface ParaProps {
  line?: number;
  lineRule?: string;
  before?: number;
  after?: number;
  beforeAuto?: boolean;
  afterAuto?: boolean;
  outlineLvl?: number;
}

function parseRunProps(rPrXml: string): RunProps {
  const xml = stripElement(rPrXml, 'w:rPrChange');
  const out: RunProps = {};
  const fonts = firstTag(xml, 'w:rFonts');
  if (fonts) {
    out.ascii = attr(fonts, 'w:ascii');
    out.hAnsi = attr(fonts, 'w:hAnsi');
    out.cs = attr(fonts, 'w:cs');
    out.asciiTheme = attr(fonts, 'w:asciiTheme');
    out.hAnsiTheme = attr(fonts, 'w:hAnsiTheme');
    out.csTheme = attr(fonts, 'w:cstheme');
  }
  const sz = firstTag(xml, 'w:sz');
  if (sz) out.sz = numAttr(sz, 'w:val');
  const szCs = firstTag(xml, 'w:szCs');
  if (szCs) out.szCs = numAttr(szCs, 'w:val');
  out.b = onOff(xml, 'w:b');
  out.bCs = onOff(xml, 'w:bCs');
  const rtl = onOff(xml, 'w:rtl');
  const cs = onOff(xml, 'w:cs');
  if (rtl !== undefined || cs !== undefined) {
    out.complexScript = Boolean(rtl || cs);
  }
  const vert = firstTag(xml, 'w:vertAlign');
  if (vert) out.superscript = attr(vert, 'w:val') === 'superscript';
  return out;
}

function parseParaProps(pPrXml: string): ParaProps {
  const xml = ['w:rPr', 'w:sectPr', 'w:pPrChange'].reduce(
    (acc, name) => stripElement(acc, name),
    pPrXml,
  );
  const out: ParaProps = {};
  const spacing = firstTag(xml, 'w:spacing');
  if (spacing) {
    out.line = numAttr(spacing, 'w:line');
    out.lineRule = attr(spacing, 'w:lineRule');
    out.before = numAttr(spacing, 'w:before');
    out.after = numAttr(spacing, 'w:after');
    const ba = attr(spacing, 'w:beforeAutospacing');
    const aa = attr(spacing, 'w:afterAutospacing');
    if (ba !== undefined) out.beforeAuto = ['1', 'true', 'on'].includes(ba);
    if (aa !== undefined) out.afterAuto = ['1', 'true', 'on'].includes(aa);
  }
  const lvl = firstTag(xml, 'w:outlineLvl');
  if (lvl) out.outlineLvl = numAttr(lvl, 'w:val');
  return out;
}

const FONT_SLOTS = [
  ['ascii', 'asciiTheme'],
  ['hAnsi', 'hAnsiTheme'],
  ['cs', 'csTheme'],
] as const;

/** Later level wins per property; an explicit font name clears an inherited theme font. */
function mergeRunProps(base: RunProps, over: RunProps): RunProps {
  const out: RunProps = { ...base };
  for (const [name, theme] of FONT_SLOTS) {
    if (over[theme] !== undefined) {
      out[theme] = over[theme];
    } else if (over[name] !== undefined) {
      delete out[theme];
    }
    if (over[name] !== undefined) out[name] = over[name];
  }
  for (const key of [
    'sz',
    'szCs',
    'b',
    'bCs',
    'complexScript',
    'superscript',
  ] as const) {
    if (over[key] !== undefined) {
      (out as Record<string, unknown>)[key] = over[key];
    }
  }
  return out;
}

function mergeParaProps(base: ParaProps, over: ParaProps): ParaProps {
  const out: ParaProps = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

interface StyleDef {
  name: string;
  type: string;
  basedOn?: string;
  run: RunProps;
  para: ParaProps;
}

interface ThemeFonts {
  majorLatin?: string;
  minorLatin?: string;
  majorCs?: string;
  minorCs?: string;
}

class StyleResolver {
  private readonly styles = new Map<string, StyleDef>();
  private readonly defaultRun: RunProps;
  private readonly defaultPara: ParaProps;
  private readonly defaultParagraphStyleId?: string;
  private readonly runCache = new Map<string, RunProps>();
  private readonly paraCache = new Map<string, ParaProps>();

  constructor(
    stylesXml: string,
    private readonly theme: ThemeFonts,
  ) {
    const defaults = innerOf(stylesXml, 'w:docDefaults') ?? '';
    this.defaultRun = parseRunProps(
      innerOf(innerOf(defaults, 'w:rPrDefault') ?? '', 'w:rPr') ?? '',
    );
    this.defaultPara = parseParaProps(
      innerOf(innerOf(defaults, 'w:pPrDefault') ?? '', 'w:pPr') ?? '',
    );
    for (const m of stylesXml.matchAll(
      /<w:style\s([^>]*)>([\s\S]*?)<\/w:style>/g,
    )) {
      const open = ` ${m[1]}`;
      const body = m[2];
      const id = attr(open, 'w:styleId');
      if (!id) continue;
      const type = attr(open, 'w:type') ?? 'paragraph';
      if (type === 'table' || type === 'numbering') continue;
      const nameTag = firstTag(body, 'w:name');
      const basedOnTag = firstTag(body, 'w:basedOn');
      const def: StyleDef = {
        name: (nameTag && attr(nameTag, 'w:val')) ?? id,
        type,
        basedOn: basedOnTag ? attr(basedOnTag, 'w:val') : undefined,
        run: parseRunProps(innerOf(body, 'w:rPr') ?? ''),
        para: parseParaProps(innerOf(body, 'w:pPr') ?? ''),
      };
      this.styles.set(id, def);
      const isDefault = attr(open, 'w:default');
      if (type === 'paragraph' && (isDefault === '1' || isDefault === 'true')) {
        this.defaultParagraphStyleId = id;
      }
    }
  }

  private chain(styleId: string | undefined): StyleDef[] {
    const out: StyleDef[] = [];
    const seen = new Set<string>();
    let id = styleId;
    while (id && !seen.has(id)) {
      seen.add(id);
      const def = this.styles.get(id);
      if (!def) break;
      out.unshift(def);
      id = def.basedOn;
    }
    return out;
  }

  private paragraphStyleId(pStyle: string | undefined): string | undefined {
    return pStyle && this.styles.has(pStyle)
      ? pStyle
      : this.defaultParagraphStyleId;
  }

  styleName(pStyle: string | undefined): string {
    const id = this.paragraphStyleId(pStyle);
    return (id && this.styles.get(id)?.name) ?? '';
  }

  paragraphProps(pStyle: string | undefined, direct: ParaProps): ParaProps {
    const id = this.paragraphStyleId(pStyle) ?? '';
    let base = this.paraCache.get(id);
    if (!base) {
      base = this.chain(id).reduce(
        (acc, s) => mergeParaProps(acc, s.para),
        this.defaultPara,
      );
      this.paraCache.set(id, base);
    }
    return mergeParaProps(base, direct);
  }

  runProps(
    pStyle: string | undefined,
    rStyle: string | undefined,
    direct: RunProps,
  ): RunProps {
    const key = `${this.paragraphStyleId(pStyle) ?? ''}|${rStyle ?? ''}`;
    let base = this.runCache.get(key);
    if (!base) {
      base = this.chain(this.paragraphStyleId(pStyle)).reduce(
        (acc, s) => mergeRunProps(acc, s.run),
        this.defaultRun,
      );
      base = this.chain(rStyle).reduce(
        (acc, s) => mergeRunProps(acc, s.run),
        base,
      );
      this.runCache.set(key, base);
    }
    return mergeRunProps(base, direct);
  }

  resolveFont(name?: string, theme?: string): string | undefined {
    if (theme) {
      const major = theme.startsWith('major');
      const resolved = theme.endsWith('Bidi')
        ? major
          ? this.theme.majorCs
          : this.theme.minorCs
        : major
          ? this.theme.majorLatin
          : this.theme.minorLatin;
      if (resolved) return resolved;
    }
    return name || undefined;
  }
}

function parseThemeFonts(themeXml: string | null): ThemeFonts {
  if (!themeXml) return {};
  const pick = (block: string | undefined) => {
    if (!block) return {};
    const latin = firstTag(block, 'a:latin');
    const cs = firstTag(block, 'a:cs');
    const arab = /<a:font\s[^>]*script="Arab"[^>]*>/.exec(block)?.[0];
    return {
      latin: (latin && attr(latin, 'typeface')) || undefined,
      cs:
        (cs && attr(cs, 'typeface')) ||
        (arab && attr(arab, 'typeface')) ||
        undefined,
    };
  };
  const major = pick(innerOf(themeXml, 'a:majorFont'));
  const minor = pick(innerOf(themeXml, 'a:minorFont'));
  return {
    majorLatin: major.latin,
    minorLatin: minor.latin,
    majorCs: major.cs,
    minorCs: minor.cs,
  };
}

// ── Document walk ─────────────────────────────────────────────────────────────

interface ParsedRun {
  text: string;
  props: RunProps;
}

interface ParsedParagraph {
  pStyle?: string;
  direct: ParaProps;
  runs: ParsedRun[];
  rStyles: (string | undefined)[];
  /** Inside a table or text box — not running body text. */
  nested: boolean;
  section: number;
}

interface ParsedSection {
  xml: string;
  letters: number;
}

const ARABIC_LETTER = /(?=\p{L})\p{Script=Arabic}/gu;
const LATIN_LETTER = /(?=\p{L})\p{Script=Latin}/gu;

function countMatches(text: string, re: RegExp): number {
  return text.match(re)?.length ?? 0;
}

/**
 * Streams paragraphs out of a WordprocessingML part without a DOM, tracking
 * table / text-box nesting and the section each paragraph belongs to.
 */
function walkParagraphs(xml: string): {
  paragraphs: ParsedParagraph[];
  sectionXml: string[];
} {
  interface RunFrame {
    rPrStart?: number;
    rPr: string;
    text: string;
    inText: boolean;
  }
  interface ParagraphFrame {
    para: ParsedParagraph;
    pPrStart?: number;
    /** Runs nest only through text boxes, which open a new paragraph frame. */
    run?: RunFrame;
  }
  const paragraphs: ParsedParagraph[] = [];
  const sectionXml: string[] = [];
  const stack: ParagraphFrame[] = [];
  let tblDepth = 0;
  let txbxDepth = 0;
  let fallbackDepth = 0;
  let changeDepth = 0;
  let section = 0;
  let sectPrStart: number | undefined;

  const newParagraph = (): ParsedParagraph => ({
    direct: {},
    runs: [],
    rStyles: [],
    nested: tblDepth > 0 || txbxDepth > 0,
    section,
  });

  const tagRe = /<(\/?)([A-Za-z0-9]+:[A-Za-z0-9]+)((?:\s[^>]*?)?)(\/?)>/g;
  let m: RegExpExecArray | null;
  let lastIndex = 0;
  while ((m = tagRe.exec(xml))) {
    const top = stack[stack.length - 1];
    if (top?.run?.inText) {
      top.run.text += xml.slice(lastIndex, m.index);
    }
    lastIndex = tagRe.lastIndex;
    const closing = m[1] === '/';
    const name = m[2];
    const selfClosing = m[4] === '/';
    const depthDelta = selfClosing ? 0 : closing ? -1 : 1;

    // VML fallbacks duplicate their DrawingML choice; tracked-change records
    // hold superseded properties. Neither describes what the reader sees.
    if (name === 'mc:Fallback') {
      fallbackDepth += depthDelta;
      continue;
    }
    if (
      name === 'w:pPrChange' ||
      name === 'w:rPrChange' ||
      name === 'w:sectPrChange'
    ) {
      changeDepth += depthDelta;
      continue;
    }
    if (fallbackDepth > 0 || changeDepth > 0) continue;

    switch (name) {
      case 'w:tbl':
        tblDepth += depthDelta;
        break;
      case 'w:txbxContent':
        txbxDepth += depthDelta;
        break;
      case 'w:p':
        if (selfClosing) {
          paragraphs.push(newParagraph());
        } else if (closing) {
          const done = stack.pop();
          if (done) paragraphs.push(done.para);
        } else {
          stack.push({ para: newParagraph() });
        }
        break;
      case 'w:pPr':
        if (!top || top.run || selfClosing) break;
        if (!closing) {
          top.pPrStart = m.index;
        } else if (top.pPrStart !== undefined) {
          const pPr = xml.slice(top.pPrStart, tagRe.lastIndex);
          top.pPrStart = undefined;
          top.para.direct = parseParaProps(pPr);
          const styleTag = firstTag(pPr, 'w:pStyle');
          top.para.pStyle = styleTag ? attr(styleTag, 'w:val') : undefined;
        }
        break;
      case 'w:sectPr':
        if (selfClosing) break;
        if (!closing) {
          sectPrStart = m.index;
        } else if (sectPrStart !== undefined) {
          sectionXml.push(xml.slice(sectPrStart, tagRe.lastIndex));
          sectPrStart = undefined;
          // A sectPr inside a paragraph closes the section *after* that paragraph.
          section += 1;
        }
        break;
      case 'w:r':
        if (!top || selfClosing) break;
        if (!closing) {
          top.run = { rPr: '', text: '', inText: false };
        } else if (top.run) {
          const rStyleTag = firstTag(top.run.rPr, 'w:rStyle');
          top.para.runs.push({
            text: decodeEntities(top.run.text),
            props: parseRunProps(top.run.rPr),
          });
          top.para.rStyles.push(
            rStyleTag ? attr(rStyleTag, 'w:val') : undefined,
          );
          top.run = undefined;
        }
        break;
      case 'w:rPr':
        if (!top?.run || selfClosing) break;
        if (!closing) {
          top.run.rPrStart = m.index;
        } else if (top.run.rPrStart !== undefined) {
          top.run.rPr = xml.slice(top.run.rPrStart, tagRe.lastIndex);
          top.run.rPrStart = undefined;
        }
        break;
      case 'w:t':
        if (top?.run && !selfClosing) top.run.inText = !closing;
        break;
      case 'w:tab':
        if (top?.run && !closing) top.run.text += ' ';
        break;
      default:
        break;
    }
  }
  return { paragraphs, sectionXml };
}

// ── Measurement ───────────────────────────────────────────────────────────────

class Tally<K extends string | number | boolean> {
  private readonly weights = new Map<K, number>();
  total = 0;

  add(key: K | undefined, weight: number): void {
    if (key === undefined || weight <= 0) return;
    this.weights.set(key, (this.weights.get(key) ?? 0) + weight);
    this.total += weight;
  }

  mode(): K | undefined {
    let best: K | undefined;
    let bestWeight = 0;
    for (const [k, w] of this.weights) {
      if (w > bestWeight) {
        best = k;
        bestWeight = w;
      }
    }
    return best;
  }
}

interface ScriptTallies {
  arabicFont: Tally<string>;
  arabicSize: Tally<number>;
  latinFont: Tally<string>;
  latinSize: Tally<number>;
  bold: Tally<boolean>;
  arabicLetters: number;
  latinLetters: number;
}

function newScriptTallies(): ScriptTallies {
  return {
    arabicFont: new Tally(),
    arabicSize: new Tally(),
    latinFont: new Tally(),
    latinSize: new Tally(),
    bold: new Tally(),
    arabicLetters: 0,
    latinLetters: 0,
  };
}

function tallyParagraphRuns(
  para: ParsedParagraph,
  styles: StyleResolver,
  into: ScriptTallies,
): void {
  para.runs.forEach((r, i) => {
    const props = styles.runProps(para.pStyle, para.rStyles[i], r.props);
    if (props.superscript) return;
    const arabic = countMatches(r.text, ARABIC_LETTER);
    const latin = countMatches(r.text, LATIN_LETTER);
    // An rtl/cs run renders every character with complex-script formatting.
    const csLetters = props.complexScript ? arabic + latin : arabic;
    const latinLetters = props.complexScript ? 0 : latin;
    into.arabicLetters += arabic;
    into.latinLetters += latin;
    if (csLetters > 0) {
      into.arabicFont.add(
        styles.resolveFont(props.cs, props.csTheme),
        csLetters,
      );
      into.arabicSize.add(props.szCs, csLetters);
      into.bold.add(Boolean(props.bCs), csLetters);
    }
    if (latinLetters > 0) {
      into.latinFont.add(
        styles.resolveFont(props.ascii, props.asciiTheme) ??
          styles.resolveFont(props.hAnsi, props.hAnsiTheme),
        latinLetters,
      );
      into.latinSize.add(props.sz, latinLetters);
      into.bold.add(Boolean(props.b), latinLetters);
    }
  });
}

function paragraphLetters(para: ParsedParagraph): number {
  return para.runs.reduce(
    (n, r) =>
      n +
      countMatches(r.text, ARABIC_LETTER) +
      countMatches(r.text, LATIN_LETTER),
    0,
  );
}

/** Size a reader sees for mixed-script text: the size carrying most letters. */
function dominantSize(t: ScriptTallies): number | undefined {
  const sizes = new Tally<number>();
  const a = t.arabicSize.mode();
  const l = t.latinSize.mode();
  sizes.add(a, t.arabicSize.total);
  sizes.add(l, t.latinSize.total);
  return sizes.mode();
}

const pt = (halfPoints: number) => `${halfPoints / 2} pt`;
const mm = (twips: number) => Math.round((twips / MM_TO_TWIPS) * 10) / 10;

/**
 * Detects dominant citation style from document body text.
 * Returns 'vancouver' for [1]/[1,2] numbered, 'apa' for (Author, Year) or
 * (المؤلف، 2020), or null when fewer than 3 citations found or style is ambiguous.
 */
function detectCitationStyle(text: string): CitationStyle | null {
  const numbered = (text.match(/\[\d[\d,،\s–-]*\]/g) ?? []).length;
  const authorYear = (
    text.match(/\([A-ZÀ-Öa-zà-öء-ي][^)]{2,60}[,،]\s*\d{4}[a-zء-ي]?\)/g) ?? []
  ).length;
  if (numbered + authorYear < 3) return null;
  if (numbered > authorYear * 1.5) return 'vancouver';
  if (authorYear > numbered * 1.5) return 'apa';
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface DocxFormatOptions {
  expectedColumns?: 1 | 2;
  /** Style the manuscript's journal requires (see `resolveCitationStyle`); omit → skip */
  citationStyle?: CitationStyle;
}

/**
 * Checks an uploaded manuscript against the profile's page and typography rules.
 *
 * Typography and spacing are measured on the formatting Word actually applies to
 * the running text (direct formatting → paragraph style chain → document
 * defaults), weighted by letter count. Reading only the Normal style would flag
 * the journal's own template, which leaves Normal at Word defaults and formats
 * the text directly.
 */
export async function checkDocxFormat(
  buffer: Buffer,
  profile: ManuscriptStyleProfile,
  expectedColumnsOrOpts: 1 | 2 | DocxFormatOptions = 1,
): Promise<DocxFormatViolation[]> {
  const opts: DocxFormatOptions =
    typeof expectedColumnsOrOpts === 'number'
      ? { expectedColumns: expectedColumnsOrOpts }
      : expectedColumnsOrOpts;

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
        severity: 'error',
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
        severity: 'error',
      },
    ];
  }

  const [documentXml, stylesXml, themeXml, footnotesXml] = await Promise.all([
    docFile.async('string'),
    stylesFile.async('string'),
    zip.file('word/theme/theme1.xml')?.async('string') ?? null,
    zip.file('word/footnotes.xml')?.async('string') ?? null,
  ]);

  const styles = new StyleResolver(stylesXml, parseThemeFonts(themeXml));
  const violations: DocxFormatViolation[] = [];
  const push = (v: DocxFormatViolation) => violations.push(v);

  // ── Classify paragraphs ─────────────────────────────────────────────────────
  const { paragraphs, sectionXml } = walkParagraphs(documentXml);
  const sections: ParsedSection[] = sectionXml.map((xml) => ({
    xml,
    letters: 0,
  }));
  const running = paragraphs.filter((p) => !p.nested);
  for (const p of paragraphs) {
    const s = sections[Math.min(p.section, sections.length - 1)];
    if (s) s.letters += paragraphLetters(p);
  }

  const titlePara = running.find((p) => paragraphLetters(p) >= 3);
  // The article carries a title in each language; both are main titles.
  const isTitle = (p: ParsedParagraph) =>
    p === titlePara || /^title$/i.test(styles.styleName(p.pStyle));
  const isHeading = (p: ParsedParagraph) => {
    const lvl = styles.paragraphProps(p.pStyle, p.direct).outlineLvl;
    return (
      (lvl !== undefined && lvl >= 0 && lvl <= 8) ||
      /^heading \d$/i.test(styles.styleName(p.pStyle))
    );
  };

  const body = newScriptTallies();
  const headings = newScriptTallies();
  const title = newScriptTallies();
  const lineSpacing = new Tally<string>();
  const spaceBefore = new Tally<string>();
  const spaceAfter = new Tally<string>();

  for (const p of running) {
    const letters = paragraphLetters(p);
    if (letters === 0) continue;
    if (isTitle(p)) {
      tallyParagraphRuns(p, styles, title);
      continue;
    }
    if (isHeading(p)) {
      tallyParagraphRuns(p, styles, headings);
      continue;
    }
    tallyParagraphRuns(p, styles, body);
    const pp = styles.paragraphProps(p.pStyle, p.direct);
    lineSpacing.add(
      `${pp.lineRule ?? 'auto'}:${pp.line ?? SINGLE_LINE_TWIPS}`,
      letters,
    );
    spaceBefore.add(pp.beforeAuto ? 'auto' : String(pp.before ?? 0), letters);
    spaceAfter.add(pp.afterAuto ? 'auto' : String(pp.after ?? 0), letters);
  }

  const articleIsArabic = body.arabicLetters >= body.latinLetters;

  // The section holding most of the text is the one readers see on most pages
  // (engineering articles put a 1-column title block before a 2-column body).
  const mainSection = sections.reduce<ParsedSection | undefined>(
    (best, s) => (!best || s.letters > best.letters ? s : best),
    undefined,
  );
  const mainXml = mainSection?.xml ?? '';
  const firstSectionXml = sections[0]?.xml ?? '';

  // ── §2: Margins ─────────────────────────────────────────────────────────────
  const pgMar = firstTag(mainXml, 'w:pgMar');
  if (pgMar) {
    const marginChecks: Array<{
      key: 'top' | 'bottom' | 'left' | 'right' | 'header' | 'footer';
      label: string;
      labelAr: string;
      severity: DocxFormatSeverity;
    }> = [
      {
        key: 'top',
        label: 'top margin',
        labelAr: 'الهامش العلوي',
        severity: 'error',
      },
      {
        key: 'bottom',
        label: 'bottom margin',
        labelAr: 'الهامش السفلي',
        severity: 'error',
      },
      {
        key: 'left',
        label: 'left margin',
        labelAr: 'الهامش الأيسر',
        severity: 'error',
      },
      {
        key: 'right',
        label: 'right margin',
        labelAr: 'الهامش الأيمن',
        severity: 'error',
      },
      // The journal's own laid-out articles move these, so they only warn.
      {
        key: 'header',
        label: 'header distance',
        labelAr: 'مسافة الرأسية',
        severity: 'warning',
      },
      {
        key: 'footer',
        label: 'footer distance',
        labelAr: 'مسافة التذييل',
        severity: 'warning',
      },
    ];
    for (const { key, label, labelAr, severity } of marginChecks) {
      const actualTwips = numAttr(pgMar, `w:${key}`);
      if (actualTwips === undefined) continue;
      const requiredMm = profile.pageMarginsMm[key];
      const expectedTwips = Math.round(requiredMm * MM_TO_TWIPS);
      if (Math.abs(actualTwips - expectedTwips) > MARGIN_TOLERANCE_TWIPS) {
        const actualMm = mm(actualTwips);
        push({
          code: `MARGIN_${key.toUpperCase()}`,
          message: `Incorrect ${label}: document has ${actualMm} mm, required ${requiredMm} mm`,
          messageAr: `${labelAr} غير صحيح: الوثيقة تحتوي على ${actualMm} ملم، المطلوب ${requiredMm} ملم`,
          expected: `${requiredMm} mm`,
          found: `${actualMm} mm`,
          severity,
        });
      }
    }
  }

  // ── Column count ────────────────────────────────────────────────────────────
  const expectedColumns = opts.expectedColumns ?? 1;
  const colsTag = firstTag(mainXml, 'w:cols');
  const cols = (colsTag && numAttr(colsTag, 'w:num')) || 1;
  if (cols !== expectedColumns) {
    push({
      code: 'COLUMN_COUNT',
      message: `Incorrect column layout: document has ${cols} column(s), required ${expectedColumns}`,
      messageAr: `تنسيق الأعمدة غير صحيح: الوثيقة تحتوي على ${cols} عمود/أعمدة، المطلوب ${expectedColumns}`,
      expected: `${expectedColumns} column(s)`,
      found: `${cols} column(s)`,
      severity: 'error',
    });
  }

  // ── §1: Header/footer — different first page ───────────────────────────────
  if (sections.length > 0 && !onOff(firstSectionXml, 'w:titlePg')) {
    push({
      code: 'DIFFERENT_FIRST_PAGE',
      message:
        'The first page must use its own header and footer ("Different First Page")',
      messageAr: 'يجب تفعيل خيار "صفحة أولى مختلفة" للرأس والتذييل',
      expected: 'Different First Page',
      found: 'not set',
      severity: 'warning',
    });
  }

  // ── §4: Line numbering (left for Arabic articles, right for English) ───────
  if (sections.length > 0 && body.arabicLetters + body.latinLetters > 0) {
    const requiredSide = articleIsArabic ? 'left' : 'right';
    const requiredSideAr = articleIsArabic ? 'اليسار' : 'اليمين';
    if (!firstTag(mainXml, 'w:lnNumType')) {
      push({
        code: 'LINE_NUMBERS_MISSING',
        message: `Lines must be numbered (on the ${requiredSide} for ${articleIsArabic ? 'Arabic' : 'English'} articles)`,
        messageAr: `يجب ترقيم الأسطر ضمن المقالة (جهة ${requiredSideAr} للمقالة المكتوبة باللغة ${articleIsArabic ? 'العربية' : 'الإنكليزية'})`,
        expected: `line numbers (${requiredSide})`,
        found: 'none',
        severity: 'warning',
      });
    } else {
      // Word draws line numbers on the right only for right-to-left sections.
      const numbersOnRight = Boolean(onOff(mainXml, 'w:bidi'));
      if (numbersOnRight !== !articleIsArabic) {
        const foundSide = numbersOnRight ? 'right' : 'left';
        push({
          code: 'LINE_NUMBERS_SIDE',
          message: `Line numbers must be on the ${requiredSide} for ${articleIsArabic ? 'Arabic' : 'English'} articles (found on the ${foundSide})`,
          messageAr: `يجب أن يكون ترقيم الأسطر جهة ${requiredSideAr} للمقالة المكتوبة باللغة ${articleIsArabic ? 'العربية' : 'الإنكليزية'}`,
          expected: requiredSide,
          found: foundSide,
          severity: 'warning',
        });
      }
    }
  }

  // ── §3: Line spacing (single) ──────────────────────────────────────────────
  const dominantLine = lineSpacing.mode();
  if (dominantLine) {
    const [rule, lineStr] = dominantLine.split(':');
    const line = Number(lineStr);
    if (rule !== 'auto') {
      push({
        code: 'LINE_SPACING_RULE',
        message: `Incorrect line spacing rule: found "${rule}", required "auto" (single spacing)`,
        messageAr: `قاعدة تباعد الأسطر غير صحيحة: تم العثور على "${rule}"، المطلوب "auto" (مفرد)`,
        expected: 'auto',
        found: rule,
        severity: 'error',
      });
    } else if (line !== profile.documentLineSpacingTwips) {
      const expected = profile.documentLineSpacingTwips;
      push({
        code: 'LINE_SPACING',
        message: `Incorrect line spacing: found ${line} twips (${(line / SINGLE_LINE_TWIPS).toFixed(2)} lines), required ${expected} (single)`,
        messageAr: `تباعد الأسطر غير صحيح: تم العثور على ${line} twips، المطلوب ${expected} (مفرد)`,
        expected: `${expected} twips (single)`,
        found: `${line} twips`,
        severity: 'error',
      });
    }
  }

  // ── §3: Paragraph spacing before/after (0 pt) ──────────────────────────────
  const spacingChecks = [
    {
      tally: spaceBefore,
      expected: profile.documentParagraphSpacing.before,
      code: 'PARA_SPACING_BEFORE',
      label: 'before',
      labelAr: 'قبل الفقرة',
    },
    {
      tally: spaceAfter,
      expected: profile.documentParagraphSpacing.after,
      code: 'PARA_SPACING_AFTER',
      label: 'after',
      labelAr: 'بعد الفقرة',
    },
  ];
  for (const { tally, expected, code, label, labelAr } of spacingChecks) {
    const found = tally.mode();
    if (found !== undefined && found !== String(expected)) {
      const shown = found === 'auto' ? 'auto' : `${found} twips`;
      push({
        code,
        message: `Incorrect paragraph spacing ${label}: found ${shown}, required ${expected}`,
        messageAr: `المسافة ${labelAr} غير صحيحة: تم العثور على ${shown}، المطلوب ${expected}`,
        expected: `${expected} twips`,
        found: shown,
        severity: 'error',
      });
    }
  }

  // ── §5: Body fonts & sizes ─────────────────────────────────────────────────
  const fontChecks = [
    {
      letters: body.arabicLetters,
      font: body.arabicFont.mode(),
      size: body.arabicSize.mode(),
      expFont: profile.fonts.arabic,
      expSize: profile.sizesHalfPoints.bodyArabic,
      fontCode: 'FONT_ARABIC',
      sizeCode: 'FONT_SIZE_ARABIC',
      label: 'Arabic body',
      labelAr: 'العربي',
    },
    {
      letters: body.latinLetters,
      font: body.latinFont.mode(),
      size: body.latinSize.mode(),
      expFont: profile.fonts.latin,
      expSize: profile.sizesHalfPoints.bodyLatin,
      fontCode: 'FONT_LATIN',
      sizeCode: 'FONT_SIZE_LATIN',
      label: 'Latin body',
      labelAr: 'اللاتيني',
    },
  ];
  for (const c of fontChecks) {
    if (
      c.letters <
      Math.min(MIN_SCRIPT_SAMPLE, body.arabicLetters + body.latinLetters)
    ) {
      continue;
    }
    if (c.font && c.font.toLowerCase() !== c.expFont.toLowerCase()) {
      push({
        code: c.fontCode,
        message: `Incorrect ${c.label} font: found "${c.font}", required "${c.expFont}"`,
        messageAr: `خط النص ${c.labelAr} غير صحيح: تم العثور على "${c.font}"، المطلوب "${c.expFont}"`,
        expected: c.expFont,
        found: c.font,
        severity: 'error',
      });
    }
    if (c.size !== undefined && c.size !== c.expSize) {
      push({
        code: c.sizeCode,
        message: `Incorrect ${c.label} font size: found ${pt(c.size)}, required ${pt(c.expSize)}`,
        messageAr: `حجم خط النص ${c.labelAr} غير صحيح: تم العثور على ${c.size / 2} نقطة، المطلوب ${c.expSize / 2} نقطة`,
        expected: pt(c.expSize),
        found: pt(c.size),
        severity: 'error',
      });
    }
  }

  // ── §5: Main title 16 pt bold; subheadings 14 pt bold ──────────────────────
  const titleSize = dominantSize(title);
  if (titleSize !== undefined && titleSize !== profile.sizesHalfPoints.title) {
    const exp = profile.sizesHalfPoints.title;
    push({
      code: 'TITLE_SIZE',
      message: `Incorrect main title font size: found ${pt(titleSize)}, required ${pt(exp)}`,
      messageAr: `حجم خط العنوان الرئيسي غير صحيح: تم العثور على ${titleSize / 2} نقطة، المطلوب ${exp / 2} نقطة`,
      expected: pt(exp),
      found: pt(titleSize),
      severity: 'warning',
    });
  }
  if (title.bold.total > 0 && title.bold.mode() === false) {
    push({
      code: 'TITLE_NOT_BOLD',
      message: 'The main title must be bold',
      messageAr: 'يجب أن يكون العنوان الرئيسي بخط غامق',
      expected: 'bold',
      found: 'regular',
      severity: 'warning',
    });
  }
  const headingSize = dominantSize(headings);
  if (
    headingSize !== undefined &&
    headingSize !== profile.sizesHalfPoints.heading1
  ) {
    const exp = profile.sizesHalfPoints.heading1;
    push({
      code: 'HEADING_SIZE',
      message: `Incorrect subheading font size: found ${pt(headingSize)}, required ${pt(exp)}`,
      messageAr: `حجم خط العناوين الفرعية غير صحيح: تم العثور على ${headingSize / 2} نقطة، المطلوب ${exp / 2} نقطة`,
      expected: pt(exp),
      found: pt(headingSize),
      severity: 'warning',
    });
  }

  // ── Footnote text 10 pt ────────────────────────────────────────────────────
  if (footnotesXml) {
    const notes = newScriptTallies();
    const noteBodies = footnotesXml.replace(
      /<w:footnote\s[^>]*w:type="(?:separator|continuationSeparator|continuationNotice)"[^>]*>[\s\S]*?<\/w:footnote>/g,
      '',
    );
    for (const p of walkParagraphs(noteBodies).paragraphs) {
      tallyParagraphRuns(p, styles, notes);
    }
    const noteSize = dominantSize(notes);
    const expFootnote =
      profile.footnoteSizeHalfPoints ?? profile.sizesHalfPoints.bodyLatin;
    if (
      notes.arabicLetters + notes.latinLetters >= MIN_SCRIPT_SAMPLE &&
      noteSize !== undefined &&
      noteSize !== expFootnote
    ) {
      push({
        code: 'FOOTNOTE_SIZE',
        message: `Incorrect footnote font size: found ${pt(noteSize)}, required ${pt(expFootnote)}`,
        messageAr: `حجم خط الحاشية السفلية غير صحيح: تم العثور على ${noteSize / 2} نقطة، المطلوب ${expFootnote / 2} نقطة`,
        expected: pt(expFootnote),
        found: pt(noteSize),
        severity: 'warning',
      });
    }
  }

  // ── Citation style (APA vs Vancouver) — heuristic, so advisory only ────────
  if (opts.citationStyle) {
    const text = running
      .map((p) => p.runs.map((r) => r.text).join(''))
      .join('\n');
    const detected = detectCitationStyle(text);
    if (opts.citationStyle === 'vancouver' && detected === 'apa') {
      push({
        code: 'CITATION_STYLE',
        message:
          'Detected APA-style (author–year) citations, but this journal requires Vancouver: numbered citations [1] and references listed in order of first citation',
        messageAr:
          'تم اكتشاف أسلوب توثيق APA (مؤلف-سنة)، لكن هذه المجلة تستلزم أسلوب Vancouver: استشهادات مرقّمة [1] وقائمة مراجع مرتّبة بحسب ورودها أول مرة في النص',
        expected: 'Vancouver [1]',
        found: 'APA (Author, Year)',
        severity: 'warning',
      });
    } else if (opts.citationStyle === 'apa' && detected === 'vancouver') {
      push({
        code: 'CITATION_STYLE',
        message:
          'Detected Vancouver-style (numbered) citations, but this journal requires APA: author–year citations (Author, Year) and an alphabetical reference list',
        messageAr:
          'تم اكتشاف أسلوب توثيق Vancouver (مرقّم)، لكن هذه المجلة تستلزم أسلوب APA: استشهادات (المؤلف، السنة) وقائمة مراجع مرتّبة أبجدياً',
        expected: 'APA (Author, Year)',
        found: 'Vancouver [1]',
        severity: 'warning',
      });
    }
  }

  return violations;
}
