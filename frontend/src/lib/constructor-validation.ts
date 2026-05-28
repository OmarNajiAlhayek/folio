import type {
  ConstructorContent,
  ConstructorGuidance,
  ConstructorValidationError,
  RichTextBlockKind,
  TitleSection,
} from "./constructor-content.types";
import { referenceEntryHasContent } from "@/lib/sanitize-constructor-html";

const RICH_TEXT_DUPLICATE_CODES: Record<RichTextBlockKind, string> = {
  acknowledgments: "CONSTRUCTOR_ACKNOWLEDGMENTS_DUPLICATE",
  funding: "CONSTRUCTOR_FUNDING_DUPLICATE",
  conflictOfInterest: "CONSTRUCTOR_CONFLICT_OF_INTEREST_DUPLICATE",
  dataAvailability: "CONSTRUCTOR_DATA_AVAILABILITY_DUPLICATE",
};

const RICH_TEXT_EMPTY_CODES: Record<RichTextBlockKind, string> = {
  acknowledgments: "CONSTRUCTOR_ACKNOWLEDGMENTS_EMPTY",
  funding: "CONSTRUCTOR_FUNDING_EMPTY",
  conflictOfInterest: "CONSTRUCTOR_CONFLICT_OF_INTEREST_EMPTY",
  dataAvailability: "CONSTRUCTOR_DATA_AVAILABILITY_EMPTY",
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

/**
 * Mirror of `backend/src/submissions/constructor-content-utils.ts`'s
 * `validateConstructorContentForSubmit`.
 */
export function validateConstructorContentLive(
  content: ConstructorContent,
  messageLookup: (code: string) => string | null,
  guidance?: ConstructorGuidance | null,
): ConstructorValidationError[] {
  const errors: ConstructorValidationError[] = [];
  const sections = content.sections;
  const fallback: Record<string, string> = {
    CONSTRUCTOR_TITLE_MISSING: "A title section is required",
    CONSTRUCTOR_TITLE_DUPLICATE: "Only one title section of this kind is allowed",
    CONSTRUCTOR_TITLE_EMPTY: "The English title cannot be empty",
    CONSTRUCTOR_TITLE_AR_EMPTY: "The Arabic title cannot be empty",
    CONSTRUCTOR_AUTHORS_DUPLICATE: "Only one authors section is allowed",
    CONSTRUCTOR_ABSTRACT_EN_MISSING: "An English abstract is required",
    CONSTRUCTOR_ABSTRACT_AR_MISSING: "An Arabic abstract is required",
    CONSTRUCTOR_REFERENCES_MISSING: "A references section is required",
    CONSTRUCTOR_REFERENCES_EMPTY:
      "The references section must contain at least one entry",
    CONSTRUCTOR_ACKNOWLEDGMENTS_DUPLICATE: "Only one acknowledgments section is allowed",
    CONSTRUCTOR_FUNDING_DUPLICATE: "Only one funding section is allowed",
    CONSTRUCTOR_CONFLICT_OF_INTEREST_DUPLICATE:
      "Only one conflict of interest section is allowed",
    CONSTRUCTOR_DATA_AVAILABILITY_DUPLICATE:
      "Only one data availability section is allowed",
    CONSTRUCTOR_ACKNOWLEDGMENTS_EMPTY: "Acknowledgments cannot be empty",
    CONSTRUCTOR_FUNDING_EMPTY: "Funding statement cannot be empty",
    CONSTRUCTOR_CONFLICT_OF_INTEREST_EMPTY:
      "Conflict of interest statement cannot be empty",
    CONSTRUCTOR_DATA_AVAILABILITY_EMPTY: "Data availability statement cannot be empty",
  };
  const push = (code: string, sectionId?: string) =>
    errors.push({
      code,
      message: messageLookup(code) ?? fallback[code] ?? code,
      sectionId,
    });

  const titles = sections.filter((s) => s.kind === "title") as TitleSection[];
  const titlesEn = titles.filter((t) => t.lang === "en" || !t.lang);
  const titlesAr = titles.filter((t) => t.lang === "ar");

  if (titlesEn.length === 0 && titlesAr.length === 0) {
    push("CONSTRUCTOR_TITLE_MISSING");
  } else {
    if (titlesEn.length > 1) push("CONSTRUCTOR_TITLE_DUPLICATE", titlesEn[1].id);
    const enTitle = titlesEn[0];
    if (enTitle && !enTitle.text?.trim()) push("CONSTRUCTOR_TITLE_EMPTY", enTitle.id);

    if (titlesAr.length > 1) push("CONSTRUCTOR_TITLE_DUPLICATE", titlesAr[1].id);
    const arTitle = titlesAr[0];
    if (arTitle && !arTitle.text?.trim()) push("CONSTRUCTOR_TITLE_AR_EMPTY", arTitle.id);
  }

  const authors = sections.filter((s) => s.kind === "authors");
  if (authors.length > 1)
    push("CONSTRUCTOR_AUTHORS_DUPLICATE", authors[1].id);

  const abstracts = sections.filter(
    (s): s is Extract<(typeof sections)[number], { kind: "abstract" }> =>
      s.kind === "abstract",
  );
  if (!abstracts.some((a) => a.lang === "en" && a.text?.trim()))
    push("CONSTRUCTOR_ABSTRACT_EN_MISSING");
  if (!abstracts.some((a) => a.lang === "ar" && a.text?.trim()))
    push("CONSTRUCTOR_ABSTRACT_AR_MISSING");

  const richKinds: RichTextBlockKind[] = [
    "acknowledgments",
    "funding",
    "conflictOfInterest",
    "dataAvailability",
  ];
  for (const kind of richKinds) {
    const matches = sections.filter((s) => s.kind === kind);
    if (matches.length > 1) {
      push(RICH_TEXT_DUPLICATE_CODES[kind], matches[1].id);
    }
  }

  for (const kind of guidance?.requiredRichTextKinds ?? []) {
    const block = sections.find((s) => s.kind === kind);
    if (!block || !stripHtml((block as { html: string }).html)) {
      push(RICH_TEXT_EMPTY_CODES[kind], block?.id);
    }
  }

  const refs = sections.filter(
    (s): s is Extract<(typeof sections)[number], { kind: "references" }> =>
      s.kind === "references",
  );
  if (refs.length === 0) push("CONSTRUCTOR_REFERENCES_MISSING");
  else if (
    refs.reduce(
      (n, r) => n + r.items.filter((i) => referenceEntryHasContent(i)).length,
      0,
    ) === 0
  )
    push("CONSTRUCTOR_REFERENCES_EMPTY", refs[0].id);

  return errors;
}
