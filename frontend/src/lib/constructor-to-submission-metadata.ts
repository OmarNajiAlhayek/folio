import type {
  AbstractSection,
  AuthorsSection,
  ConstructorContent,
  TitleSection,
} from "@/lib/constructor-content.types";
import { parseKeywordsFromStorage, serializeKeywords } from "@/lib/keywords";
import type {
  ContributorRow,
  SubmissionMetadataFormInitial,
} from "@/app/[locale]/submissions/[slug]/submission-workflow-forms";

/**
 * Maps constructor JSON into submission metadata form defaults.
 * Omits article type, declarations, and file uploads — user completes those on `/submissions/new`.
 */
export function constructorContentToSubmissionMetadataInitial(
  content: ConstructorContent | null | undefined,
): Partial<SubmissionMetadataFormInitial> {
  if (!content?.sections?.length) return {};

  let title = "";
  let titleAr = "";
  let abstract = "";
  let abstractAr = "";
  const enKeywordTags: string[] = [];
  const arKeywordTags: string[] = [];
  let contributors: ContributorRow[] | null = null;

  for (const s of content.sections) {
    if (s.kind === "title") {
      const ts = s as TitleSection;
      if (ts.lang === "ar" && !titleAr) titleAr = ts.text;
      else if (!title) title = ts.text;
    }
    if (s.kind === "abstract") {
      const abs = s as AbstractSection;
      const tags = parseKeywordsFromStorage(abs.keywords);
      if (abs.lang === "ar") {
        if (!abstractAr) abstractAr = abs.text;
        if (tags.length && arKeywordTags.length === 0) arKeywordTags.push(...tags);
      } else {
        if (!abstract) abstract = abs.text;
        if (tags.length && enKeywordTags.length === 0) enKeywordTags.push(...tags);
      }
    }
    if (s.kind === "authors" && !contributors) {
      const auth = s as AuthorsSection;
      if (auth.authors.length > 0) {
        contributors = auth.authors.map((a, i) => ({
          fullName: a.fullName,
          email: a.email?.trim() || "",
          affiliation: a.affiliation,
          sortOrder: i,
          isCorresponding: a.isCorresponding,
        }));
      }
    }
  }

  const out: Partial<SubmissionMetadataFormInitial> = {
    title,
    titleAr,
    abstract,
    abstractAr,
  };
  if (enKeywordTags.length) out.keywords = serializeKeywords(enKeywordTags);
  if (arKeywordTags.length) out.keywordsAr = serializeKeywords(arKeywordTags);
  if (contributors) out.contributors = contributors;
  return out;
}
