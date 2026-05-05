import type {
  ConstructorContent,
  ConstructorSection,
  ConstructorValidationError,
  TitleSection,
} from './constructor-content.types';

/**
 * Returns the set of `submission_files.id` values referenced by any
 * `ImageSection` in the given content. Used by `update()` to detect
 * which file rows can be safely deleted after a constructorContent PATCH.
 */
export function collectReferencedFileIds(
  content: ConstructorContent | null | undefined,
): Set<string> {
  const ids = new Set<string>();
  if (!content?.sections) return ids;
  for (const s of content.sections) {
    if (s.kind === 'image' && s.fileId) {
      ids.add(s.fileId);
    }
  }
  return ids;
}

/**
 * Returns file IDs referenced by `oldContent` but not `newContent`.
 * These are the files safe to delete after a successful PATCH.
 */
export function diffOrphanedFileIds(
  oldContent: ConstructorContent | null | undefined,
  newContent: ConstructorContent | null | undefined,
): string[] {
  const before = collectReferencedFileIds(oldContent);
  const after = collectReferencedFileIds(newContent);
  return [...before].filter((id) => !after.has(id));
}

/**
 * Submit-time validation per `docs/plans/word-constructor.md`.
 * Returns an array of errors; empty array means the content is valid.
 */
export function validateConstructorContentForSubmit(
  content: ConstructorContent | null | undefined,
): ConstructorValidationError[] {
  const errors: ConstructorValidationError[] = [];
  if (!content || !Array.isArray(content.sections)) {
    errors.push({
      code: 'CONSTRUCTOR_EMPTY',
      message: 'Constructor content is empty',
    });
    return errors;
  }
  const sections: ConstructorSection[] = content.sections;

  const titles = sections.filter((s) => s.kind === 'title') as TitleSection[];
  // EN titles: lang === "en", or legacy sections without a lang field
  const titlesEn = titles.filter((t) => t.lang === 'en' || !t.lang);
  const titlesAr = titles.filter((t) => t.lang === 'ar');

  if (titlesEn.length === 0 && titlesAr.length === 0) {
    errors.push({ code: 'CONSTRUCTOR_TITLE_MISSING', message: 'A title section is required' });
  } else {
    if (titlesEn.length > 1) {
      errors.push({ code: 'CONSTRUCTOR_TITLE_DUPLICATE', message: 'Only one title section of this kind is allowed', sectionId: titlesEn[1].id });
    }
    const enTitle = titlesEn[0];
    if (enTitle && !enTitle.text?.trim()) {
      errors.push({ code: 'CONSTRUCTOR_TITLE_EMPTY', message: 'The English title cannot be empty', sectionId: enTitle.id });
    }

    if (titlesAr.length > 1) {
      errors.push({ code: 'CONSTRUCTOR_TITLE_DUPLICATE', message: 'Only one title section of this kind is allowed', sectionId: titlesAr[1].id });
    }
    const arTitle = titlesAr[0];
    if (arTitle && !arTitle.text?.trim()) {
      errors.push({ code: 'CONSTRUCTOR_TITLE_AR_EMPTY', message: 'The Arabic title cannot be empty', sectionId: arTitle.id });
    }
  }

  const authors = sections.filter((s) => s.kind === 'authors');
  if (authors.length > 1) {
    errors.push({
      code: 'CONSTRUCTOR_AUTHORS_DUPLICATE',
      message: 'Only one authors section is allowed',
      sectionId: authors[1].id,
    });
  }

  const abstracts = sections.filter(
    (s): s is Extract<ConstructorSection, { kind: 'abstract' }> =>
      s.kind === 'abstract',
  );
  const hasEn = abstracts.some((a) => a.lang === 'en' && a.text?.trim());
  const hasAr = abstracts.some((a) => a.lang === 'ar' && a.text?.trim());
  if (!hasEn) {
    errors.push({
      code: 'CONSTRUCTOR_ABSTRACT_EN_MISSING',
      message: 'An English abstract is required',
    });
  }
  if (!hasAr) {
    errors.push({
      code: 'CONSTRUCTOR_ABSTRACT_AR_MISSING',
      message: 'An Arabic abstract is required',
    });
  }

  const refs = sections.filter(
    (s): s is Extract<ConstructorSection, { kind: 'references' }> =>
      s.kind === 'references',
  );
  if (refs.length === 0) {
    errors.push({
      code: 'CONSTRUCTOR_REFERENCES_MISSING',
      message: 'A references section is required',
    });
  } else {
    const total = refs.reduce(
      (n, r) => n + r.items.filter((i) => i.text?.trim()).length,
      0,
    );
    if (total === 0) {
      errors.push({
        code: 'CONSTRUCTOR_REFERENCES_EMPTY',
        message: 'The references section must contain at least one entry',
        sectionId: refs[0].id,
      });
    }
  }

  return errors;
}
