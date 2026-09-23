import type { CitationStyle } from '../manuscript-styles/citation-style';
import type {
  ConstructorContent,
  ConstructorReferenceEntry,
  ConstructorSection,
} from './constructor-content.types';
import { stripConstructorHtml } from './constructor-content-utils';
import {
  getTableCellText,
  isTableCellCovered,
} from './constructor-table-utils';

/**
 * Extracts plain-text body (excluding references section) for LanguageTool grammar analysis.
 * Returned text is capped to avoid oversized API payloads.
 */
export const MAX_GRAMMAR_TEXT_CHARS = 20_000;

/**
 * Regex patterns for extracting inline citations from body text.
 * Handles:
 *   - Author-year: (Smith, 2020), (Smith et al., 2020), Smith (2020)
 *   - Arabic author-year: (المؤلف، 2020), (المؤلف وآخرون، 2020)
 *   - Numbered: [1], [1,2], [1-3]
 *   - Multiple: (Smith, 2020; Jones, 2019)
 */
const CITATION_PATTERNS = [
  /\([^)]{1,120},\s*\d{4}[a-z]?(?:;\s*[^)]{1,120},\s*\d{4}[a-z]?)*\)/gu,
  /\([\u0600-\u06FF\s]{2,60}[،,]\s*\d{4}[;\u061B]?[^)]*\)/gu,
  /\[\d+(?:\s*[,،–-]\s*\d+)*\]/gu,
] as const;

function extractInlineCitationsFromText(text: string): string[] {
  const found = new Set<string>();
  for (const pattern of CITATION_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const raw = match[0].trim();
      if (raw.length > 2) found.add(raw);
    }
  }
  return [...found];
}

function bodyPlainPart(section: ConstructorSection): string {
  switch (section.kind) {
    case 'heading1':
    case 'heading2':
    case 'heading3':
      return section.text.trim();
    case 'paragraph':
    case 'acknowledgments':
    case 'funding':
    case 'conflictOfInterest':
    case 'dataAvailability': {
      return stripConstructorHtml(section.html);
    }
    case 'table': {
      const cells = section.rows.flatMap((row) =>
        row
          .filter((c) => !isTableCellCovered(c))
          .map((c) => getTableCellText(c).trim())
          .filter(Boolean),
      );
      if (section.notes) cells.push(section.notes.trim());
      return cells.join(' ');
    }
    case 'image':
      return section.caption.trim();
    case 'abstract':
      return section.text.trim();
    default:
      return '';
  }
}

/**
 * Extracts plain text of the manuscript body (no title, no references section)
 * for grammar/spelling analysis via LanguageTool.
 */
export function buildBodyPlainText(
  content: ConstructorContent | null | undefined,
): string {
  if (!content?.sections?.length) return '';
  const parts: string[] = [];
  for (const section of content.sections) {
    if (section.kind === 'references' || section.kind === 'authors') continue;
    const part = bodyPlainPart(section);
    if (part) parts.push(part);
  }
  const raw = parts.join('\n\n').trim();
  return raw.length <= MAX_GRAMMAR_TEXT_CHARS
    ? raw
    : raw.slice(0, MAX_GRAMMAR_TEXT_CHARS);
}

/**
 * Extracts the plain-text entries from the References section of the constructor.
 * Strips HTML from each entry's `html` field, falls back to `text` for legacy items.
 */
export function extractReferenceList(
  content: ConstructorContent | null | undefined,
): string[] {
  if (!content?.sections?.length) return [];
  const refs: ConstructorReferenceEntry[] = [];
  for (const section of content.sections) {
    if (section.kind === 'references') {
      refs.push(...section.items);
    }
  }
  return refs
    .map((r) => {
      const plain = r.html
        ? stripConstructorHtml(r.html).trim()
        : (r.text?.trim() ?? '');
      return plain;
    })
    .filter((t) => t.length > 0);
}

/**
 * Scans the body text for inline citation patterns and returns unique matches.
 * Used to cross-check against the reference list.
 */
export function extractInlineCitations(
  content: ConstructorContent | null | undefined,
): string[] {
  if (!content?.sections?.length) return [];
  const allText: string[] = [];
  for (const section of content.sections) {
    if (section.kind === 'references' || section.kind === 'authors') continue;
    const part = bodyPlainPart(section);
    if (part) allText.push(part);
  }
  return extractInlineCitationsFromText(allText.join('\n'));
}

/** Damascus structure check: which expected IMRaD section kinds are present. */
export type DamascusStructureCheck = {
  // IMRaD structure
  hasIntroduction: boolean;
  hasLiteratureReview: boolean;
  hasMaterialsAndMethods: boolean;
  hasResultsAndDiscussion: boolean;
  hasConclusions: boolean;
  hasReferences: boolean;
  // Abstracts
  hasAbstractEn: boolean;
  hasAbstractAr: boolean;
  abstractEnWordCount: number;
  abstractArWordCount: number;
  totalBodyWordCount: number;
  // Titles (§4: must be in both Arabic and English)
  hasTitleEn: boolean;
  hasTitleAr: boolean;
  // Authors (§4: at least one author, exactly one corresponding, all with email, title, and affiliation)
  hasAuthors: boolean;
  hasCorrespondingAuthor: boolean;
  authorsWithoutEmail: string[];
  authorsWithoutAffiliation: string[];
  authorsWithoutTitle: string[];
  // Keywords (§3: exactly 5 per abstract, must appear inside abstract text)
  hasKeywordsEn: boolean;
  hasKeywordsAr: boolean;
  keywordsEnCount: number;
  keywordsArCount: number;
  keywordsEnPresentInAbstract: boolean;
  keywordsArPresentInAbstract: boolean;
  // References ordering (§7: Arabic refs before English refs)
  referencesArabicFirstCompliant: boolean;
  // Table notes (§5: table notes must start with "حيث إن:")
  tableNotesWithoutPrefix: number;
  // Conclusions structure (§4: conclusions must contain numbered paragraphs)
  conclusionsHasNumberedItems: boolean;
  // Punctuation spacing (§3: no space before ،,;:!?. and no space inside () or "")
  punctuationSpacingViolations: number;
  // Citation page prefix (§6: no ص or p before page numbers)
  citationPagePrefixViolations: number;
  // English title/keyword capitalisation (§3: first letter of each English word must be capital)
  englishTitleCapitalisationOk: boolean;
  englishKeywordsCapitalisationOk: boolean;
};

/**
 * Counts occurrences of "ص " or "p " immediately before a page number in inline citations
 * per Damascus University §6: "لا يُستخدم حرف (ص) أو (p) قبل رقم الصفحة".
 */
function countCitationPagePrefixViolations(text: string): number {
  const matches = text.match(/[،,;\s][صp]\s+\d+/gi);
  return Math.min(matches?.length ?? 0, 50);
}

/**
 * Returns true if every word in the text starts with an uppercase ASCII letter.
 * Ignores short articles (a, an, the, of, in, and, or, for, to, by) unless first word.
 */
function isTitleCase(text: string): boolean {
  const ARTICLES = new Set([
    'a',
    'an',
    'the',
    'of',
    'in',
    'and',
    'or',
    'for',
    'to',
    'by',
    'with',
    'at',
    'from',
  ]);
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.every((word, idx) => {
    const clean = word.replace(/[^\w]/g, '');
    if (!clean || !/^[a-zA-Z]/.test(clean)) return true;
    if (idx > 0 && ARTICLES.has(clean.toLowerCase())) return true;
    return clean[0] === clean[0].toUpperCase();
  });
}

function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

/** Splits a keywords string on Arabic/Latin commas and semicolons. */
function splitKeywords(keywords: string): string[] {
  return keywords
    .split(/[,،;؛]/)
    .map((k) => k.trim())
    .filter(Boolean);
}

/** Returns true if every keyword token appears (case-insensitive) in the abstract text. */
function keywordsAllPresentInText(
  keywords: string[],
  abstractText: string,
): boolean {
  if (keywords.length === 0) return true;
  const lower = abstractText.toLowerCase();
  return keywords.every((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * Counts punctuation-spacing violations per Damascus University §3:
 *   - No space before ،,؛;:!؟?.
 *   - No space immediately after an opening bracket/parenthesis/quote
 *   - No space immediately before a closing bracket/parenthesis/quote
 * Result is capped at 50 to avoid noise in the issue message.
 */
function countPunctuationViolations(text: string): number {
  let count = 0;
  const patterns = [
    /[ \t][،,؛;:!؟?.]/g, // space before punctuation
    /[[({][ \t]/g, // space after opening delimiter
    /[ \t][)\]}]/g, // space before closing delimiter
    /"[ \t]/g, // space after opening double-quote
    /[ \t]"/g, // space before closing double-quote
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) count += m.length;
  }
  return Math.min(count, 50);
}

/** Performs structural Damascus format validation against the constructor content. */
export function checkDamascusStructure(
  content: ConstructorContent | null | undefined,
): DamascusStructureCheck {
  const result: DamascusStructureCheck = {
    // IMRaD
    hasIntroduction: false,
    hasLiteratureReview: false,
    hasMaterialsAndMethods: false,
    hasResultsAndDiscussion: false,
    hasConclusions: false,
    hasReferences: false,
    // Abstracts
    hasAbstractEn: false,
    hasAbstractAr: false,
    abstractEnWordCount: 0,
    abstractArWordCount: 0,
    totalBodyWordCount: 0,
    // Titles
    hasTitleEn: false,
    hasTitleAr: false,
    // Authors
    hasAuthors: false,
    hasCorrespondingAuthor: false,
    authorsWithoutEmail: [],
    authorsWithoutAffiliation: [],
    authorsWithoutTitle: [],
    // Keywords — default "present" to true so we only flag when keywords actually exist but fail
    hasKeywordsEn: false,
    hasKeywordsAr: false,
    keywordsEnCount: 0,
    keywordsArCount: 0,
    keywordsEnPresentInAbstract: true,
    keywordsArPresentInAbstract: true,
    // References ordering
    referencesArabicFirstCompliant: true,
    // Table notes
    tableNotesWithoutPrefix: 0,
    // Conclusions structure
    conclusionsHasNumberedItems: false,
    // Punctuation
    punctuationSpacingViolations: 0,
    // Citation page prefix
    citationPagePrefixViolations: 0,
    // English capitalisation (default true = no issue)
    englishTitleCapitalisationOk: true,
    englishKeywordsCapitalisationOk: true,
  };

  if (!content?.sections?.length) return result;

  let bodyWordTotal = 0;
  const bodyTextParts: string[] = [];
  let inConclusionsSection = false;

  for (const section of content.sections) {
    // ── Titles ──────────────────────────────────────────────────────────────
    if (section.kind === 'title') {
      if (section.lang === 'ar') {
        result.hasTitleAr = section.text.trim().length > 0;
      } else {
        // lang 'en' or absent (legacy — treat as English title)
        const titleText = section.text.trim();
        result.hasTitleEn = titleText.length > 0;
        if (titleText.length > 0) {
          result.englishTitleCapitalisationOk = isTitleCase(titleText);
        }
      }
      continue;
    }

    // ── Authors ─────────────────────────────────────────────────────────────
    if (section.kind === 'authors') {
      if (section.authors.length > 0) {
        result.hasAuthors = true;
        for (const author of section.authors) {
          if (author.isCorresponding) result.hasCorrespondingAuthor = true;
          if (!author.email?.trim()) {
            result.authorsWithoutEmail.push(author.fullName || '(unnamed)');
          }
          if (!author.affiliation?.trim()) {
            result.authorsWithoutAffiliation.push(
              author.fullName || '(unnamed)',
            );
          }
          if (!author.title?.trim()) {
            result.authorsWithoutTitle.push(author.fullName || '(unnamed)');
          }
        }
      }
      continue;
    }

    // ── Abstracts & keywords ─────────────────────────────────────────────────
    if (section.kind === 'abstract') {
      if (section.lang === 'en') {
        result.hasAbstractEn = section.text.trim().length > 0;
        result.abstractEnWordCount = wordCount(section.text);
        if (section.keywords?.trim()) {
          result.hasKeywordsEn = true;
          const tokens = splitKeywords(section.keywords);
          result.keywordsEnCount = tokens.length;
          result.keywordsEnPresentInAbstract = keywordsAllPresentInText(
            tokens,
            section.text,
          );
          result.englishKeywordsCapitalisationOk = tokens.every((kw) =>
            isTitleCase(kw),
          );
        }
      } else if (section.lang === 'ar') {
        result.hasAbstractAr = section.text.trim().length > 0;
        result.abstractArWordCount = wordCount(section.text);
        if (section.keywords?.trim()) {
          result.hasKeywordsAr = true;
          const tokens = splitKeywords(section.keywords);
          result.keywordsArCount = tokens.length;
          result.keywordsArPresentInAbstract = keywordsAllPresentInText(
            tokens,
            section.text,
          );
        }
      }
      continue;
    }

    // ── References ───────────────────────────────────────────────────────────
    if (section.kind === 'references') {
      result.hasReferences = section.items.length > 0;
      let seenEnglish = false;
      for (const item of section.items) {
        if (item.lang === 'en') seenEnglish = true;
        if (item.lang === 'ar' && seenEnglish) {
          result.referencesArabicFirstCompliant = false;
          break;
        }
      }
      continue;
    }

    // ── Table notes prefix (§5) ───────────────────────────────────────────────
    if (section.kind === 'table') {
      const notes = section.notes?.trim();
      if (notes && !notes.startsWith('حيث إن') && !notes.startsWith('حيث')) {
        result.tableNotesWithoutPrefix += 1;
      }
    }

    // ── Headings: IMRaD detection + conclusions tracking ─────────────────────
    if (
      section.kind === 'heading1' ||
      section.kind === 'heading2' ||
      section.kind === 'heading3'
    ) {
      const t = section.text.toLowerCase();
      if (/introduction|مقدمة/.test(t)) {
        result.hasIntroduction = true;
        inConclusionsSection = false;
      }
      if (/literature|review|الأدب|السابق|الدراسات/.test(t)) {
        result.hasLiteratureReview = true;
        inConclusionsSection = false;
      }
      if (/material|method|منهج|مواد/.test(t)) {
        result.hasMaterialsAndMethods = true;
        inConclusionsSection = false;
      }
      if (/result|discussion|نتائج|مناقشة/.test(t)) {
        result.hasResultsAndDiscussion = true;
        inConclusionsSection = false;
      }
      if (/conclusion|استنتاج|خاتمة/.test(t)) {
        result.hasConclusions = true;
        inConclusionsSection = true;
      }
    }

    // presetSourceId overrides text-based detection
    if ('presetSourceId' in section && section.presetSourceId) {
      switch (section.presetSourceId) {
        case 'introduction':
          result.hasIntroduction = true;
          inConclusionsSection = false;
          break;
        case 'literatureReview':
          result.hasLiteratureReview = true;
          inConclusionsSection = false;
          break;
        case 'materialsAndMethods':
          result.hasMaterialsAndMethods = true;
          inConclusionsSection = false;
          break;
        case 'resultsAndDiscussion':
          result.hasResultsAndDiscussion = true;
          inConclusionsSection = false;
          break;
        case 'conclusions':
          result.hasConclusions = true;
          inConclusionsSection = true;
          break;
      }
    }

    // ── Conclusions: look for numbered list items (§4) ───────────────────────
    if (inConclusionsSection && section.kind === 'paragraph') {
      if (/<ol\b/i.test(section.html)) {
        result.conclusionsHasNumberedItems = true;
      }
    }

    const part = bodyPlainPart(section);
    if (part) {
      bodyWordTotal += wordCount(part);
      bodyTextParts.push(part);
    }
  }

  const joinedBody = bodyTextParts.join('\n');
  result.totalBodyWordCount = bodyWordTotal;
  result.punctuationSpacingViolations = countPunctuationViolations(joinedBody);
  result.citationPagePrefixViolations =
    countCitationPagePrefixViolations(joinedBody);

  return result;
}

/**
 * Converts a DamascusStructureCheck into a list of human-readable format issues.
 * Returns an empty array if the manuscript is fully compliant.
 */
export function damascusFormatIssues(check: DamascusStructureCheck): string[] {
  const issues: string[] = [];

  // ── Titles (§4) ──────────────────────────────────────────────────────────
  if (!check.hasTitleEn)
    issues.push(
      'Missing English title (§4: title must be provided in both Arabic and English).',
    );
  if (!check.hasTitleAr)
    issues.push(
      'Missing Arabic title (§4: title must be provided in both Arabic and English).',
    );

  // ── Authors (§4) ─────────────────────────────────────────────────────────
  if (!check.hasAuthors) issues.push('No authors listed.');
  if (check.hasAuthors && !check.hasCorrespondingAuthor)
    issues.push(
      'No corresponding author marked — exactly one author must be designated as the correspondence author (§4).',
    );
  for (const name of check.authorsWithoutEmail)
    issues.push(
      `Author "${name}" has no email address (§4: all authors must provide their email).`,
    );
  for (const name of check.authorsWithoutAffiliation)
    issues.push(
      `Author "${name}" has no institution/affiliation (§4: all authors must provide their جهة).`,
    );
  for (const name of check.authorsWithoutTitle)
    issues.push(
      `Author "${name}" has no academic title/rank (§4: all authors must provide their صفة — e.g., دكتور / Dr.).`,
    );

  // ── Abstracts (§3) ───────────────────────────────────────────────────────
  if (!check.hasAbstractEn) issues.push('Missing English abstract.');
  if (!check.hasAbstractAr) issues.push('Missing Arabic abstract.');
  if (check.abstractEnWordCount > 300)
    issues.push(
      `English abstract exceeds 300 words (found ${check.abstractEnWordCount}).`,
    );
  if (check.abstractArWordCount > 300)
    issues.push(
      `Arabic abstract exceeds 300 words (found ${check.abstractArWordCount}).`,
    );

  // ── Keywords (§3) ────────────────────────────────────────────────────────
  if (!check.hasKeywordsEn)
    issues.push(
      'Missing keywords for the English abstract (§3: exactly 5 keywords are required).',
    );
  if (!check.hasKeywordsAr)
    issues.push(
      'Missing keywords for the Arabic abstract (§3: exactly 5 keywords are required).',
    );
  if (check.hasKeywordsEn && check.keywordsEnCount !== 5)
    issues.push(
      `English abstract has ${check.keywordsEnCount} keyword(s) — exactly 5 are required (§3).`,
    );
  if (check.hasKeywordsAr && check.keywordsArCount !== 5)
    issues.push(
      `Arabic abstract has ${check.keywordsArCount} keyword(s) — exactly 5 are required (§3).`,
    );
  if (check.hasKeywordsEn && !check.keywordsEnPresentInAbstract)
    issues.push(
      'One or more English keywords do not appear in the English abstract text (§3: keywords must be drawn from within the abstract).',
    );
  if (check.hasKeywordsAr && !check.keywordsArPresentInAbstract)
    issues.push(
      'One or more Arabic keywords do not appear in the Arabic abstract text (§3: keywords must be drawn from within the abstract).',
    );

  // ── IMRaD structure (§4) ─────────────────────────────────────────────────
  if (!check.hasIntroduction)
    issues.push("Missing required 'Introduction' section.");
  if (!check.hasLiteratureReview)
    issues.push("Missing required 'Literature Review' section.");
  if (!check.hasMaterialsAndMethods)
    issues.push("Missing required 'Materials and Methods' section.");
  if (!check.hasResultsAndDiscussion)
    issues.push("Missing required 'Results and Discussion' section.");
  if (!check.hasConclusions)
    issues.push("Missing required 'Conclusions' section.");
  if (check.hasConclusions && !check.conclusionsHasNumberedItems)
    issues.push(
      'Conclusions section does not contain numbered paragraphs (§4: conclusions must be presented as numbered points).',
    );

  // ── References (§4, §7) ──────────────────────────────────────────────────
  if (!check.hasReferences)
    issues.push('No references section found or references list is empty.');
  if (!check.referencesArabicFirstCompliant)
    issues.push(
      'References are not ordered Arabic-first — all Arabic-language references must precede English-language references (§7).',
    );

  // ── Word count (§3) ──────────────────────────────────────────────────────
  if (check.totalBodyWordCount > 7_500)
    issues.push(
      `Manuscript body exceeds the ~7,500-word soft limit for the Damascus format (found ${check.totalBodyWordCount} words).`,
    );

  // ── Table notes (§5) ─────────────────────────────────────────────────────
  if (check.tableNotesWithoutPrefix > 0)
    issues.push(
      `${check.tableNotesWithoutPrefix} table note(s) do not begin with "حيث إن:" — Damascus University §5 requires this phrase to precede explanatory table notes.`,
    );

  // ── Punctuation spacing (§3) ─────────────────────────────────────────────
  if (check.punctuationSpacingViolations > 0)
    issues.push(
      `Found ${check.punctuationSpacingViolations} punctuation-spacing violation(s) — §3 requires no space before punctuation marks (،,؛;:!؟?.) and no space inside parentheses or quotation marks.`,
    );

  // ── Citation page prefix (§6) ─────────────────────────────────────────────
  if (check.citationPagePrefixViolations > 0)
    issues.push(
      `Found ${check.citationPagePrefixViolations} citation(s) using "ص" or "p" before a page number — §6 requires the page number to appear directly without this prefix.`,
    );

  // ── English title/keyword capitalisation (§3) ─────────────────────────────
  if (!check.englishTitleCapitalisationOk)
    issues.push(
      'English title does not use Title Case — §3 requires the first letter of each significant word in the English title to be a capital letter.',
    );
  if (!check.englishKeywordsCapitalisationOk)
    issues.push(
      'One or more English keywords do not start with a capital letter — §3 requires Title Case for English keywords.',
    );

  return issues;
}

// ── Citation style (APA for every journal, Vancouver for the medical journal) ─

/** Numbers a numbered citation points at: `[1]` → 1, `[2,4]` → 2,4, `[5–7]` → 5,6,7. */
function numberedCitationTargets(citation: string): number[] {
  const out: number[] = [];
  for (const part of citation.slice(1, -1).split(/[,،]/)) {
    const [from, to] = part.split(/[–-]/).map((n) => Number(n.trim()));
    if (!Number.isInteger(from)) continue;
    const end =
      Number.isInteger(to) && to >= from ? Math.min(to, from + 50) : from;
    for (let n = from; n <= end; n += 1) out.push(n);
  }
  return out;
}

/**
 * Format warnings for the citation style the manuscript's journal requires
 * (see `resolveCitationStyle`). `null` style → journal unknown → no warnings.
 *
 * Vancouver also checks what makes the numbers meaningful: new numbers appear
 * in order of first citation, and none points past the end of the list.
 */
export function damascusCitationStyleIssues(
  citationStyle: CitationStyle | null,
  content: ConstructorContent | null | undefined,
): string[] {
  if (!content || !citationStyle) return [];
  const citations = extractInlineCitations(content);
  const numbered = citations.filter((c) => /^\[\d/.test(c));
  const authorYearCount = citations.filter((c) => /^\(/.test(c)).length;

  if (citations.length >= 3) {
    if (citationStyle === 'vancouver' && authorYearCount > numbered.length) {
      return [
        'Detected APA-style (author–year) citations, but this journal requires Vancouver: cite by number in square brackets [1] and list references in order of first citation.',
      ];
    }
    if (citationStyle === 'apa' && numbered.length > authorYearCount) {
      return [
        'Detected Vancouver-style (numbered) citations, but this journal requires APA: cite as (Author, Year) and list references alphabetically, Arabic references first.',
      ];
    }
  }
  if (citationStyle !== 'vancouver' || numbered.length === 0) return [];

  const issues: string[] = [];
  const firstSeen: number[] = [];
  for (const citation of numbered) {
    for (const n of numberedCitationTargets(citation)) {
      if (!firstSeen.includes(n)) firstSeen.push(n);
    }
  }
  const outOfOrder = firstSeen.findIndex((n, i) => n !== i + 1);
  if (outOfOrder >= 0) {
    issues.push(
      `Citations are not numbered in order of first appearance: [${firstSeen[outOfOrder]}] appears where [${outOfOrder + 1}] is expected — Vancouver numbers references in the order they are first cited in the text.`,
    );
  }
  const referenceCount = extractReferenceList(content).length;
  const highest = Math.max(...firstSeen);
  if (referenceCount > 0 && highest > referenceCount) {
    issues.push(
      `Citation [${highest}] has no reference — the reference list has only ${referenceCount} entr${referenceCount === 1 ? 'y' : 'ies'}.`,
    );
  }
  return issues;
}

// ── Discipline-aware checks ──────────────────────────────────────────────────

const ENGINEERING_DISCIPLINE = 'العلوم الهندسية';

/**
 * Returns format warnings based on the submission's AI-classified disciplines:
 * the two-column layout requirement for engineering submissions (§3).
 * Citation style depends on the journal instead — see
 * {@link damascusCitationStyleIssues}.
 */
export function damascusDisciplineIssues(
  disciplines: string[],
  content: ConstructorContent | null | undefined,
): string[] {
  if (!content || disciplines.length === 0) return [];
  const issues: string[] = [];

  const isEngineering = disciplines.includes(ENGINEERING_DISCIPLINE);

  // Two-column layout warning for Engineering
  if (isEngineering) {
    issues.push(
      'Engineering discipline manuscripts (العلوم الهندسية) must use a two-column page layout per Damascus University §3. Please verify the final .docx is formatted in two columns before submission.',
    );
  }

  return issues;
}
