/**
 * Arabic-aware text folding for search, keeping offsets into the original string.
 *
 * A TypeScript port of `services/ai-service/app/ml/exact_match/arabic_normalize.py`.
 * The two must agree: `search-normalize.fixture.json` is the contract, driven by
 * this package's spec and by the Python test suite.
 *
 * Why offsets matter: normalization and highlighting pull against each other. Once
 * `أ` folds to `ا` and harakat are stripped, the matched string is no longer the
 * displayed string, so `text.replace(query, ...)` silently fails on exactly the
 * Arabic input normalization was added to rescue. `tokenize` therefore returns the
 * folded form *and* the span it came from, so callers match on one and highlight
 * the other.
 *
 * Stemming and stopword removal are deliberately absent, as in the Python original:
 * search-as-you-type wants prefix matching, not conflation.
 */

export type Token = {
  /** Folded form, for matching. */
  readonly text: string;
  /** Start offset in the *original* text, for highlighting. */
  readonly start: number;
  /** End offset (exclusive) in the original text. */
  readonly end: number;
};

export type Range = {
  readonly start: number;
  readonly end: number;
};

export type MatchOptions = {
  /**
   * Treat each query token as a prefix (`eng jour` matches `Engineering Journal`).
   * On by default: a search box is read while it is still being typed.
   */
  readonly prefix?: boolean;
};

type CodepointRange = readonly [number, number];

// Built from code points rather than literals: these characters are invisible or
// combining, so a literal string is unreviewable and corrupts easily in editors.
const COMBINING_RANGES: readonly CodepointRange[] = [
  [0x0610, 0x061a], // Arabic signs / honorifics
  [0x064b, 0x065f], // harakat and extended harakat
  [0x0670, 0x0670], // superscript alef
  [0x06d6, 0x06ed], // Quranic annotation marks
  [0x08d3, 0x08ff], // Arabic Extended-A marks
];

const INVISIBLE_RANGES: readonly CodepointRange[] = [
  [0x200b, 0x200f], // ZWSP, ZWNJ, ZWJ, LRM, RLM
  [0x202a, 0x202e], // bidi embedding / override
  [0x2066, 0x2069], // bidi isolates
  [0xfe00, 0xfe0f], // variation selectors
];

const TATWEEL = 0x0640;

function codepointsIn(ranges: readonly CodepointRange[]): number[] {
  const out: number[] = [];
  for (const [lo, hi] of ranges) {
    for (let cp = lo; cp <= hi; cp += 1) out.push(cp);
  }
  return out;
}

const STRIP_CODEPOINTS: ReadonlySet<number> = new Set([
  ...codepointsIn(COMBINING_RANGES),
  ...codepointsIn(INVISIBLE_RANGES),
  TATWEEL,
  0x005f, // underscore
]);

const LETTER_FOLD: Readonly<Record<string, string>> = {
  // alef carriers -> bare alef
  'أ': 'ا', // hamza above
  'إ': 'ا', // hamza below
  'آ': 'ا', // madda
  'ٱ': 'ا', // wasla
  'ٲ': 'ا',
  'ٳ': 'ا',
  'ٵ': 'ا',
  // ya / alef maqsura -> ya
  'ى': 'ي', // alef maqsura
  'ی': 'ي', // Farsi ya
  // hamza carriers
  'ؤ': 'و', // waw with hamza -> waw
  'ئ': 'ي', // ya with hamza -> ya
  'ء': '', // bare hamza carries no standalone signal
  // ta marbuta -> ha
  'ة': 'ه',
  // Farsi/Urdu glyphs that leak in from scanned PDFs
  'ک': 'ك', // keheh -> kaf
  'گ': 'ك', // gaf -> kaf
  'ھ': 'ه', // heh doachashmee -> heh
  'ە': 'ه', // ae -> heh
};

const DIGIT_FOLD: Readonly<Record<string, string>> = Object.fromEntries([
  // Arabic-Indic and extended Arabic-Indic digits -> ASCII
  ...Array.from({ length: 10 }, (_, i) => [String.fromCharCode(0x0660 + i), String(i)]),
  ...Array.from({ length: 10 }, (_, i) => [String.fromCharCode(0x06f0 + i), String(i)]),
]);

const FOLD_TABLE: ReadonlyMap<string, string> = new Map(
  Object.entries({ ...LETTER_FOLD, ...DIGIT_FOLD }),
);

/**
 * Where JavaScript's `toLowerCase` differs from Python's `casefold`, which the
 * reference implementation uses.
 *
 * These run *after* lowercasing, not before: `'Σ'.toLowerCase()` applies the
 * final-sigma rule and yields `'ς'`, so a pre-pass would never see the character it
 * needs to fold.
 */
const CASE_FOLD_EXTRAS: Readonly<Record<string, string>> = {
  'ß': 'ss',
  'ς': 'σ',
};

function caseFold(value: string): string {
  let out = '';
  for (const ch of value.toLowerCase()) {
    out += CASE_FOLD_EXTRAS[ch] ?? ch;
  }
  return out;
}

/** Mirrors Python's `str.isalnum()` closely enough for the fixture to hold. */
const ALNUM = /[\p{L}\p{N}]/u;

// Combining marks must stay *inside* a token, otherwise a diacritic splits the word.
const TOKEN_CLASS = [...COMBINING_RANGES, [TATWEEL, TATWEEL] as CodepointRange]
  .map(([lo, hi]) => `\\u{${lo.toString(16)}}-\\u{${hi.toString(16)}}`)
  .join('');
const TOKEN_PATTERN = new RegExp(`[\\p{L}\\p{N}_${TOKEN_CLASS}]+`, 'gu');

/**
 * Fold one raw word to its match form.
 *
 * Returns `''` when nothing matchable survives (pure punctuation, a lone diacritic,
 * a stray hamza).
 */
export function normalizeToken(raw: string): string {
  if (!raw) return '';
  let folded = '';
  for (const ch of raw.normalize('NFKC')) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined && STRIP_CODEPOINTS.has(cp)) continue;
    const mapped = FOLD_TABLE.get(ch);
    const next = mapped === undefined ? ch : mapped;
    if (!next) continue;
    folded += next;
  }
  let out = '';
  for (const ch of caseFold(folded)) {
    if (ALNUM.test(ch)) out += ch;
  }
  return out;
}

/**
 * Split text into folded tokens carrying original character offsets.
 *
 * Offsets index `text` as given, so callers can slice the original string to build
 * a highlightable span.
 */
export function tokenize(text: string): Token[] {
  if (!text) return [];
  const tokens: Token[] = [];
  TOKEN_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const normalized = normalizeToken(raw);
    if (!normalized) continue;
    tokens.push({ text: normalized, start, end: start + raw.length });
  }
  return tokens;
}

/** Space-joined folded tokens. Use for stored search columns and comparisons. */
export function normalizeText(text: string): string {
  return tokenize(text)
    .map((token) => token.text)
    .join(' ');
}

/** Folded tokens without offsets — the cheap path for filter predicates. */
export function tokenTexts(text: string): string[] {
  return tokenize(text).map((token) => token.text);
}

/** The Arabic definite article, after folding (أل and إل have already become ال). */
const DEFINITE_ARTICLE = 'ال';

/**
 * Shortest stem we will expose by removing `ال`. Arabic roots are three letters,
 * so a one-character remainder is far more likely to be a word that merely starts
 * with alef-lam than a definite noun.
 */
const MIN_STEM_AFTER_ARTICLE = 2;

/**
 * `الهندسة` without its article, or `null` if there is nothing to strip.
 *
 * Deliberately *not* part of `normalizeToken`: that function is byte-compatible with
 * the Python reference, which feeds plagiarism fingerprints where dropping the
 * article would corrupt a hash. Article-insensitivity belongs to search alone.
 */
function withoutDefiniteArticle(token: string): string | null {
  if (!token.startsWith(DEFINITE_ARTICLE)) return null;
  const stem = token.slice(DEFINITE_ARTICLE.length);
  return stem.length >= MIN_STEM_AFTER_ARTICLE ? stem : null;
}

function compareToken(docToken: string, queryToken: string, prefix: boolean): boolean {
  return prefix ? docToken.startsWith(queryToken) : docToken === queryToken;
}

/**
 * Compare two folded tokens, ignoring the Arabic definite article on either side,
 * so `هندسة` finds `الهندسة` and vice versa.
 */
function tokenMatches(docToken: string, queryToken: string, prefix: boolean): boolean {
  if (compareToken(docToken, queryToken, prefix)) return true;

  const docStem = withoutDefiniteArticle(docToken);
  if (docStem && compareToken(docStem, queryToken, prefix)) return true;

  const queryStem = withoutDefiniteArticle(queryToken);
  if (queryStem && compareToken(docToken, queryStem, prefix)) return true;

  return false;
}

/**
 * True when every query token matches some token in `text`.
 *
 * Order-insensitive and, by default, prefix-matched, so `هندسه` finds
 * `الهندسة` and `eng jour` finds `Journal of Engineering`. An empty query
 * matches everything, which is what an empty search box should do.
 */
export function matchesQuery(
  text: string,
  query: string,
  options: MatchOptions = {},
): boolean {
  const queryTokens = tokenTexts(query);
  if (queryTokens.length === 0) return true;
  return matchesTokens(tokenTexts(text), queryTokens, options);
}

/**
 * `matchesQuery` over pre-tokenized input — for filtering a list, where the query
 * should be tokenized once rather than once per row.
 */
export function matchesTokens(
  docTokens: readonly string[],
  queryTokens: readonly string[],
  options: MatchOptions = {},
): boolean {
  if (queryTokens.length === 0) return true;
  const prefix = options.prefix ?? true;
  return queryTokens.every((queryToken) =>
    docTokens.some((docToken) => tokenMatches(docToken, queryToken, prefix)),
  );
}

/**
 * Spans of `text` that `query` matches, as offsets into the original string.
 *
 * Ranges come back sorted and merged, so a caller can walk them in order and slice
 * the original text into plain and highlighted runs.
 */
export function matchRanges(
  text: string,
  query: string,
  options: MatchOptions = {},
): Range[] {
  const queryTokens = tokenTexts(query);
  if (queryTokens.length === 0 || !text) return [];
  const prefix = options.prefix ?? true;

  const hits: Range[] = [];
  for (const token of tokenize(text)) {
    const hit = queryTokens.some((queryToken) =>
      tokenMatches(token.text, queryToken, prefix),
    );
    if (hit) hits.push({ start: token.start, end: token.end });
  }
  return mergeRanges(hits);
}

/** Merge overlapping or touching ranges; assumes nothing about input order. */
export function mergeRanges(ranges: readonly Range[]): Range[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Range[] = [{ ...sorted[0] }];
  for (const range of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (range.start <= last.end) {
      if (range.end > last.end) merged[merged.length - 1] = { start: last.start, end: range.end };
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/**
 * Split `text` into consecutive runs flagged as matched or not, covering the whole
 * string. The shape a highlight renderer wants: map runs to `<mark>` or plain text.
 */
export function highlightSegments(
  text: string,
  query: string,
  options: MatchOptions = {},
): Array<{ text: string; match: boolean }> {
  const ranges = matchRanges(text, query, options);
  if (ranges.length === 0) return text ? [{ text, match: false }] : [];

  const segments: Array<{ text: string; match: boolean }> = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      segments.push({ text: text.slice(cursor, range.start), match: false });
    }
    segments.push({ text: text.slice(range.start, range.end), match: true });
    cursor = range.end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), match: false });
  }
  return segments;
}
