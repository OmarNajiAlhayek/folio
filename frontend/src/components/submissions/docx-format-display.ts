export type DocxFormatLocale = 'en' | 'ar';

export type DocxFormatViolationView = {
  code: string;
  message: string;
  messageAr: string;
  found: string;
  expected: string;
  severity?: 'error' | 'warning';
};

export type DocxFormatGroupId =
  | 'margins'
  | 'headerFooter'
  | 'columns'
  | 'fonts'
  | 'paragraphSpacing'
  | 'lineSpacing'
  | 'title'
  | 'footnotes'
  | 'lineNumbers'
  | 'firstPage'
  | 'citations'
  | 'file'
  | 'other';

export type DocxFormatGroup = {
  id: DocxFormatGroupId;
  presentation: 'compare' | 'sentence';
  hint: 'static' | 'message' | 'none';
  items: DocxFormatViolationView[];
};

const GROUP_DEFS: Array<{
  id: Exclude<DocxFormatGroupId, 'other'>;
  codes: string[];
  presentation: 'compare' | 'sentence';
  hint: 'static' | 'message' | 'none';
}> = [
  {
    id: 'margins',
    codes: ['MARGIN_TOP', 'MARGIN_BOTTOM', 'MARGIN_LEFT', 'MARGIN_RIGHT'],
    presentation: 'compare',
    hint: 'static',
  },
  {
    id: 'headerFooter',
    codes: ['MARGIN_HEADER', 'MARGIN_FOOTER'],
    presentation: 'compare',
    hint: 'static',
  },
  {
    id: 'columns',
    codes: ['COLUMN_COUNT'],
    presentation: 'compare',
    hint: 'static',
  },
  {
    id: 'fonts',
    codes: ['FONT_LATIN', 'FONT_SIZE_LATIN', 'FONT_ARABIC', 'FONT_SIZE_ARABIC'],
    presentation: 'compare',
    hint: 'static',
  },
  {
    id: 'paragraphSpacing',
    codes: ['PARA_SPACING_BEFORE', 'PARA_SPACING_AFTER'],
    presentation: 'compare',
    hint: 'static',
  },
  {
    id: 'lineSpacing',
    codes: ['LINE_SPACING', 'LINE_SPACING_RULE'],
    presentation: 'compare',
    hint: 'static',
  },
  {
    id: 'title',
    codes: ['TITLE_SIZE', 'TITLE_NOT_BOLD', 'HEADING_SIZE'],
    presentation: 'compare',
    hint: 'static',
  },
  {
    id: 'footnotes',
    codes: ['FOOTNOTE_SIZE'],
    presentation: 'compare',
    hint: 'static',
  },
  {
    id: 'lineNumbers',
    codes: ['LINE_NUMBERS_MISSING', 'LINE_NUMBERS_SIDE'],
    presentation: 'compare',
    hint: 'static',
  },
  {
    id: 'firstPage',
    codes: ['DIFFERENT_FIRST_PAGE'],
    presentation: 'compare',
    hint: 'static',
  },
  {
    id: 'citations',
    codes: ['CITATION_STYLE'],
    presentation: 'compare',
    hint: 'message',
  },
  {
    id: 'file',
    codes: ['DOCX_UNREADABLE', 'DOCX_MISSING_PARTS'],
    presentation: 'sentence',
    hint: 'none',
  },
];

const CODE_GROUP = new Map(
  GROUP_DEFS.flatMap((group) =>
    group.codes.map((code) => [code, group] as const),
  ),
);

/** Word single spacing is 240 twips; 20 twips = 1 pt. */
const SINGLE_LINE_TWIPS = 240;

type UnitCopy = {
  single: string;
  double: string;
  auto: string;
  none: string;
  notSet: string;
  bold: string;
  regular: string;
  left: string;
  right: string;
  differentFirstPage: string;
  exactly: (amount: string) => string;
  atLeast: (amount: string) => string;
  pt: (amount: string) => string;
  cm: (amount: string) => string;
  columns: (count: number) => string;
};

const COPY: Record<DocxFormatLocale, UnitCopy> = {
  en: {
    single: 'Single',
    double: 'Double',
    auto: 'Auto',
    none: 'None',
    notSet: 'Not set',
    bold: 'Bold',
    regular: 'Regular',
    left: 'Left',
    right: 'Right',
    differentFirstPage: 'Different first page',
    exactly: (amount) => (amount ? `Exactly ${amount} pt` : 'Exactly'),
    atLeast: (amount) => (amount ? `At least ${amount} pt` : 'At least'),
    pt: (amount) => `${amount} pt`,
    cm: (amount) => `${amount} cm`,
    columns: (count) => (count === 1 ? '1 column' : `${count} columns`),
  },
  ar: {
    single: 'مفرد',
    double: 'مزدوج',
    auto: 'تلقائي',
    none: 'لا يوجد',
    notSet: 'غير مفعّل',
    bold: 'غامق',
    regular: 'عادي',
    left: 'اليسار',
    right: 'اليمين',
    differentFirstPage: 'صفحة أولى مختلفة',
    exactly: (amount) => (amount ? `تماماً ${amount} نقطة` : 'تماماً'),
    atLeast: (amount) => (amount ? `على الأقل ${amount} نقطة` : 'على الأقل'),
    pt: (amount) => `${amount} نقطة`,
    cm: (amount) => `${amount} سم`,
    columns: (count) =>
      count === 1 ? 'عمود واحد' : count === 2 ? 'عمودان' : `${count} أعمدة`,
  },
};

function roundMeasure(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  return String(Math.round(n * 100) / 100);
}

function lineSpacingFromTwips(twips: number, copy: UnitCopy): string {
  const lines = twips / SINGLE_LINE_TWIPS;
  if (Math.abs(lines - 1) < 0.01) return copy.single;
  if (Math.abs(lines - 2) < 0.01) return copy.double;
  if (Math.abs(lines - 1.5) < 0.01) return '1.5';
  if (Math.abs(lines - 1.15) < 0.02) return '1.15';
  return roundMeasure(lines);
}

function isLineSpacingCode(code: string): boolean {
  return code === 'LINE_SPACING' || code === 'LINE_SPACING_RULE';
}

/**
 * Turns a stored found/expected string into what an author should read.
 * Older uploads still say "twips" and "mm"; new ones already use pt and cm.
 */
export function formatDocxFormatValue(
  raw: string,
  code: string,
  locale: DocxFormatLocale,
): string {
  const copy = COPY[locale];
  const trimmed = raw.trim();

  const twips = /^(\d+(?:\.\d+)?)\s*twips(?:\s*\(([^)]+)\))?$/i.exec(trimmed);
  if (twips) {
    const amount = Number(twips[1]);
    const note = twips[2]?.toLowerCase() ?? '';
    if (isLineSpacingCode(code) || note.includes('single')) {
      return lineSpacingFromTwips(amount, copy);
    }
    return copy.pt(roundMeasure(amount / 20));
  }

  const millimeters = /^(\d+(?:\.\d+)?)\s*mm$/i.exec(trimmed);
  if (millimeters) return copy.cm(roundMeasure(Number(millimeters[1]) / 10));

  const centimeters = /^(\d+(?:\.\d+)?)\s*cm$/i.exec(trimmed);
  if (centimeters) return copy.cm(roundMeasure(Number(centimeters[1])));

  const exactly = /^exactly\s+(\d+(?:\.\d+)?)\s*pt$/i.exec(trimmed);
  if (exactly) return copy.exactly(roundMeasure(Number(exactly[1])));

  const atLeast = /^at\s+least\s+(\d+(?:\.\d+)?)\s*pt$/i.exec(trimmed);
  if (atLeast) return copy.atLeast(roundMeasure(Number(atLeast[1])));

  const points = /^(\d+(?:\.\d+)?)\s*pt$/i.exec(trimmed);
  if (points) return copy.pt(roundMeasure(Number(points[1])));

  const columns = /^(\d+)\s+columns?(?:\(s\))?$/i.exec(trimmed);
  if (columns) return copy.columns(Number(columns[1]));

  const numberedSide = /^line numbers \((left|right)\)$/i.exec(trimmed);
  if (numberedSide) {
    return numberedSide[1].toLowerCase() === 'left' ? copy.left : copy.right;
  }

  const token = trimmed.toLowerCase();
  if (token === 'single') return copy.single;
  if (token === 'double') return copy.double;
  if (token === 'auto')
    return isLineSpacingCode(code) ? copy.single : copy.auto;
  if (token === 'none') return copy.none;
  if (token === 'not set') return copy.notSet;
  if (token === 'bold') return copy.bold;
  if (token === 'regular') return copy.regular;
  if (token === 'left') return copy.left;
  if (token === 'right') return copy.right;
  if (token === 'different first page') return copy.differentFirstPage;
  if (token === 'exact') return copy.exactly('');
  if (token === 'atleast' || token === 'at least') return copy.atLeast('');

  if (isLineSpacingCode(code) && /^\d+(?:\.\d+)?$/.test(trimmed)) {
    const lines = Number(trimmed);
    if (Math.abs(lines - 1) < 0.01) return copy.single;
    if (Math.abs(lines - 2) < 0.01) return copy.double;
    return roundMeasure(lines);
  }

  return trimmed;
}

export function groupDocxViolations(
  violations: DocxFormatViolationView[],
): DocxFormatGroup[] {
  const buckets = new Map<DocxFormatGroupId, DocxFormatViolationView[]>();
  const other: DocxFormatViolationView[] = [];

  for (const violation of violations) {
    const group = CODE_GROUP.get(violation.code);
    if (!group) {
      other.push(violation);
      continue;
    }
    const list = buckets.get(group.id) ?? [];
    list.push(violation);
    buckets.set(group.id, list);
  }

  const groups: DocxFormatGroup[] = [];
  for (const def of GROUP_DEFS) {
    const items = buckets.get(def.id);
    if (!items?.length) continue;
    items.sort((a, b) => def.codes.indexOf(a.code) - def.codes.indexOf(b.code));
    groups.push({
      id: def.id,
      presentation: def.presentation,
      hint: def.hint,
      items,
    });
  }
  if (other.length > 0) {
    groups.push({
      id: 'other',
      presentation: 'sentence',
      hint: 'none',
      items: other,
    });
  }
  return groups;
}
