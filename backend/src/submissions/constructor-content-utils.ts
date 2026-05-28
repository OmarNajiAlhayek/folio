import type {
  ConstructorContent,
  ConstructorGuidance,
  ConstructorSection,
  ConstructorValidationError,
  RichTextBlockKind,
  TitleSection,
} from './constructor-content.types';
import { referenceEntryHasContent } from './sanitize-constructor-html';

/** Strip HTML tags from constructor rich-text blocks (shared with corpus plain-text export). */
export function stripConstructorHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

function stripHtml(html: string): string {
  return stripConstructorHtml(html);
}

function sectionHasContent(section: ConstructorSection): boolean {
  switch (section.kind) {
    case 'title':
    case 'heading1':
    case 'heading2':
    case 'heading3':
      return section.text.trim().length > 0;
    case 'abstract':
      return (
        section.text.trim().length > 0 || section.keywords.trim().length > 0
      );
    case 'paragraph':
    case 'acknowledgments':
    case 'funding':
    case 'conflictOfInterest':
    case 'dataAvailability':
      return stripHtml(section.html).length > 0;
    case 'authors':
      return section.authors.some((a) => a.fullName.trim().length > 0);
    case 'references':
      return section.items.some((r) => referenceEntryHasContent(r));
    case 'image':
      return Boolean(section.fileId) || section.caption.trim().length > 0;
    case 'table':
      return (
        section.rows.some((row) => row.some((c) => c.trim().length > 0)) ||
        (section.notes?.trim().length ?? 0) > 0
      );
    case 'equation':
      return section.latex.trim().length > 0;
    default:
      return false;
  }
}

/** True when the author has entered real content (not only empty mandatory slots). */
export function hasMeaningfulConstructorContent(
  content: ConstructorContent | null | undefined,
): boolean {
  if (!content?.sections?.length) return false;
  return content.sections.some((s) => {
    if ('pinned' in s && s.pinned && !sectionHasContent(s)) return false;
    return sectionHasContent(s);
  });
}

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

export function diffOrphanedFileIds(
  oldContent: ConstructorContent | null | undefined,
  newContent: ConstructorContent | null | undefined,
): string[] {
  const before = collectReferencedFileIds(oldContent);
  const after = collectReferencedFileIds(newContent);
  return [...before].filter((id) => !after.has(id));
}

const RICH_TEXT_DUPLICATE_CODES: Record<RichTextBlockKind, string> = {
  acknowledgments: 'CONSTRUCTOR_ACKNOWLEDGMENTS_DUPLICATE',
  funding: 'CONSTRUCTOR_FUNDING_DUPLICATE',
  conflictOfInterest: 'CONSTRUCTOR_CONFLICT_OF_INTEREST_DUPLICATE',
  dataAvailability: 'CONSTRUCTOR_DATA_AVAILABILITY_DUPLICATE',
};

const RICH_TEXT_EMPTY_CODES: Record<RichTextBlockKind, string> = {
  acknowledgments: 'CONSTRUCTOR_ACKNOWLEDGMENTS_EMPTY',
  funding: 'CONSTRUCTOR_FUNDING_EMPTY',
  conflictOfInterest: 'CONSTRUCTOR_CONFLICT_OF_INTEREST_EMPTY',
  dataAvailability: 'CONSTRUCTOR_DATA_AVAILABILITY_EMPTY',
};

export function validateConstructorContentForSubmit(
  content: ConstructorContent | null | undefined,
  guidance?: ConstructorGuidance | null,
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

  const richKinds: RichTextBlockKind[] = [
    'acknowledgments',
    'funding',
    'conflictOfInterest',
    'dataAvailability',
  ];
  for (const kind of richKinds) {
    const matches = sections.filter((s) => s.kind === kind);
    if (matches.length > 1) {
      errors.push({
        code: RICH_TEXT_DUPLICATE_CODES[kind],
        message: `Only one ${kind} section is allowed`,
        sectionId: matches[1].id,
      });
    }
  }

  const requiredRich = guidance?.requiredRichTextKinds ?? [];
  for (const kind of requiredRich) {
    const block = sections.find((s) => s.kind === kind);
    if (!block || !stripHtml((block as { html: string }).html)) {
      errors.push({
        code: RICH_TEXT_EMPTY_CODES[kind],
        message: `The ${kind} section is required and cannot be empty`,
        sectionId: block?.id,
      });
    }
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
      (n, r) => n + r.items.filter((i) => referenceEntryHasContent(i)).length,
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

export { sectionHasContent };
