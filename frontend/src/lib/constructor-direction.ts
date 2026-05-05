import type {
  ConstructorContent,
  ConstructorDir,
  ConstructorSection,
} from "./constructor-content.types";

/**
 * If more than `ARABIC_THRESHOLD` of letter characters in `text` fall in the
 * Arabic Unicode ranges, classify the text as RTL. The 0.30 threshold is
 * deliberately permissive so that Arabic text with English citations is still
 * flagged as RTL. Tune here if real-world articles misfire — note tied in
 * docs/plans/word-constructor.md (Implementation Note 1).
 */
export const ARABIC_THRESHOLD = 0.3;

/**
 * Arabic Unicode ranges: base, supplement, extended, presentation forms A & B.
 * Latin letters are everything in `\p{L}` that is NOT Arabic — but we use a
 * narrower fast path on a-zA-Z + accents for speed; everything else still
 * counts toward the denominator.
 */
const ARABIC_REGEX =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
const LETTER_REGEX = /\p{L}/gu;

export function detectDirection(text: string): ConstructorDir {
  if (!text) return "ltr";
  const letters = text.match(LETTER_REGEX);
  if (!letters || letters.length === 0) return "ltr";
  const arabic = text.match(ARABIC_REGEX);
  const ratio = (arabic?.length ?? 0) / letters.length;
  return ratio > ARABIC_THRESHOLD ? "rtl" : "ltr";
}

/** Resolved direction for a section: explicit override → document default. */
export function resolveSectionDir(
  section: ConstructorSection,
  defaultDir: ConstructorDir,
): ConstructorDir {
  if (section.kind === "abstract") {
    return section.lang === "ar" ? "rtl" : "ltr";
  }
  return section.dir ?? defaultDir;
}

/**
 * Word-count weighted heuristic for the page-count badge.
 *   words(text) + 150 × imageCount + 80 × tableRowCount
 * Soft warning fires above ~7,500 weighted words (≈ 25 pages, style.md max).
 */
export function estimateWeightedWordCount(content: ConstructorContent): {
  words: number;
  weighted: number;
  warn: boolean;
} {
  let words = 0;
  let images = 0;
  let tableRows = 0;
  for (const section of content.sections) {
    switch (section.kind) {
      case "title":
      case "heading1":
      case "heading2":
      case "heading3":
        words += countWordsInPlain(section.text);
        break;
      case "abstract":
        words += countWordsInPlain(section.text);
        words += countWordsInPlain(section.keywords);
        break;
      case "paragraph":
        words += countWordsInPlain(stripHtml(section.html));
        break;
      case "image":
        images += 1;
        words += countWordsInPlain(section.caption);
        break;
      case "table":
        tableRows += section.rows.length;
        words += countWordsInPlain(section.caption);
        for (const row of section.rows) {
          for (const cell of row) words += countWordsInPlain(cell);
        }
        break;
      case "authors":
        for (const a of section.authors) {
          words += countWordsInPlain(
            `${a.fullName} ${a.title} ${a.affiliation}`,
          );
        }
        break;
      case "references":
        for (const r of section.items) words += countWordsInPlain(r.text);
        break;
    }
  }
  const weighted = words + 150 * images + 80 * tableRows;
  return { words, weighted, warn: weighted > 7500 };
}

function countWordsInPlain(s: string | null | undefined): number {
  if (!s) return 0;
  const t = s.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>(\n|\r)?/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
