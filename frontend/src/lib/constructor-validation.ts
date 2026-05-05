import type {
  ConstructorContent,
  ConstructorValidationError,
  TitleSection,
} from "./constructor-content.types";

/**
 * Mirror of `backend/src/submissions/constructor-content-utils.ts`'s
 * `validateConstructorContentForSubmit`. The frontend version returns the
 * same { code, message } shape so the `ValidationBanner` renders identical
 * UI for both live edits and post-submit server errors.
 *
 * `messageLookup` translates a code → localized message; if a code is unknown
 * the English fallback is shown verbatim.
 */
export function validateConstructorContentLive(
  content: ConstructorContent,
  messageLookup: (code: string) => string | null,
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
  };
  const push = (code: string, sectionId?: string) =>
    errors.push({
      code,
      message: messageLookup(code) ?? fallback[code] ?? code,
      sectionId,
    });

  const titles = sections.filter((s) => s.kind === "title") as TitleSection[];
  // EN titles: lang === "en", or legacy sections without a lang field
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

  const refs = sections.filter(
    (s): s is Extract<(typeof sections)[number], { kind: "references" }> =>
      s.kind === "references",
  );
  if (refs.length === 0) push("CONSTRUCTOR_REFERENCES_MISSING");
  else if (
    refs.reduce(
      (n, r) => n + r.items.filter((i) => i.text?.trim()).length,
      0,
    ) === 0
  )
    push("CONSTRUCTOR_REFERENCES_EMPTY", refs[0].id);

  return errors;
}
