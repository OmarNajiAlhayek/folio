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
  /\[\d+(?:[,،–-]\d+)*\]/gu,
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
  hasIntroduction: boolean;
  hasLiteratureReview: boolean;
  hasMaterialsAndMethods: boolean;
  hasResultsAndDiscussion: boolean;
  hasConclusions: boolean;
  hasReferences: boolean;
  hasAbstractEn: boolean;
  hasAbstractAr: boolean;
  abstractEnWordCount: number;
  abstractArWordCount: number;
  totalBodyWordCount: number;
};

function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

/** Performs structural Damascus format validation against the constructor content. */
export function checkDamascusStructure(
  content: ConstructorContent | null | undefined,
): DamascusStructureCheck {
  const result: DamascusStructureCheck = {
    hasIntroduction: false,
    hasLiteratureReview: false,
    hasMaterialsAndMethods: false,
    hasResultsAndDiscussion: false,
    hasConclusions: false,
    hasReferences: false,
    hasAbstractEn: false,
    hasAbstractAr: false,
    abstractEnWordCount: 0,
    abstractArWordCount: 0,
    totalBodyWordCount: 0,
  };

  if (!content?.sections?.length) return result;

  let bodyWordTotal = 0;

  for (const section of content.sections) {
    if (section.kind === 'abstract') {
      if (section.lang === 'en') {
        result.hasAbstractEn = section.text.trim().length > 0;
        result.abstractEnWordCount = wordCount(section.text);
      } else if (section.lang === 'ar') {
        result.hasAbstractAr = section.text.trim().length > 0;
        result.abstractArWordCount = wordCount(section.text);
      }
      continue;
    }
    if (section.kind === 'references') {
      result.hasReferences = section.items.length > 0;
      continue;
    }

    if (
      section.kind === 'heading1' ||
      section.kind === 'heading2' ||
      section.kind === 'heading3'
    ) {
      const t = section.text.toLowerCase();
      if (/introduction|مقدمة/.test(t)) result.hasIntroduction = true;
      if (/literature|review|الأدب|السابق|الدراسات/.test(t))
        result.hasLiteratureReview = true;
      if (/material|method|منهج|مواد/.test(t))
        result.hasMaterialsAndMethods = true;
      if (/result|discussion|نتائج|مناقشة/.test(t))
        result.hasResultsAndDiscussion = true;
      if (/conclusion|استنتاج|خاتمة/.test(t)) result.hasConclusions = true;
    }

    // Use presetSourceId as a reliable signal if set
    if ('presetSourceId' in section && section.presetSourceId) {
      switch (section.presetSourceId) {
        case 'introduction':
          result.hasIntroduction = true;
          break;
        case 'literatureReview':
          result.hasLiteratureReview = true;
          break;
        case 'materialsAndMethods':
          result.hasMaterialsAndMethods = true;
          break;
        case 'resultsAndDiscussion':
          result.hasResultsAndDiscussion = true;
          break;
        case 'conclusions':
          result.hasConclusions = true;
          break;
      }
    }

    const part = bodyPlainPart(section);
    if (part) bodyWordTotal += wordCount(part);
  }

  result.totalBodyWordCount = bodyWordTotal;
  return result;
}

/**
 * Converts a DamascusStructureCheck into a list of human-readable format issues.
 * Returns an empty array if the manuscript is fully compliant.
 */
export function damascusFormatIssues(check: DamascusStructureCheck): string[] {
  const issues: string[] = [];

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
  if (!check.hasReferences)
    issues.push('No references section found or references list is empty.');
  if (check.totalBodyWordCount > 7_500)
    issues.push(
      `Manuscript body exceeds the ~7,500-word soft limit for the Damascus format (found ${check.totalBodyWordCount} words).`,
    );

  return issues;
}
