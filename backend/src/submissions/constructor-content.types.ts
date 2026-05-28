/**
 * Structured representation of a Word-Constructor article.
 *
 * Stored in `submissions.constructor_content` (JSONB) and consumed by:
 *  - `DocxGeneratorService` to produce the `.docx` deliverable
 *  - The frontend constructor UI for editing & live preview
 *
 * The same shape lives in `frontend/src/lib/constructor-content.types.ts`;
 * keep them in sync.
 *
 * `captionNumber` is intentionally NOT stored — figure / table numbering
 * is derived per-render by walking the section list in order.
 */

export type ConstructorDir = 'ltr' | 'rtl';

export type ConstructorPresetId =
  | 'introduction'
  | 'literatureReview'
  | 'materialsAndMethods'
  | 'resultsAndDiscussion'
  | 'conclusions';

export type ConstructorSectionKind =
  | 'title'
  | 'authors'
  | 'abstract'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'paragraph'
  | 'image'
  | 'table'
  | 'references'
  | 'acknowledgments'
  | 'funding'
  | 'conflictOfInterest'
  | 'dataAvailability'
  | 'equation';

export type RichTextBlockKind =
  | 'acknowledgments'
  | 'funding'
  | 'conflictOfInterest'
  | 'dataAvailability';

export interface BaseConstructorSection {
  id: string;
  kind: ConstructorSectionKind;
  /** Optional override of the document's `defaultDir`. Inherits if omitted. */
  dir?: ConstructorDir;
  /** Tracks whether `dir` was set manually by the user or auto-detected. */
  dirSource?: 'auto' | 'manual';
  /** When true, the section is mandatory and its remove button is disabled in the UI. */
  pinned?: boolean;
  /** Set when inserted from an IMRaD structure preset; used for profile recommendations. */
  presetSourceId?: ConstructorPresetId;
}

export interface TitleSection extends BaseConstructorSection {
  kind: 'title';
  text: string;
  /** Distinguishes bilingual title sections (EN vs AR). Optional for backward compat. */
  lang?: 'en' | 'ar';
}

export interface AuthorsSection extends BaseConstructorSection {
  kind: 'authors';
  authors: ConstructorAuthorEntry[];
}

export interface AbstractSection extends BaseConstructorSection {
  kind: 'abstract';
  /** Single source of truth for direction — `ar` ⇒ rtl, `en` ⇒ ltr. */
  lang: 'en' | 'ar';
  text: string;
  keywords: string;
}

export interface HeadingSection extends BaseConstructorSection {
  kind: 'heading1' | 'heading2' | 'heading3';
  text: string;
}

export interface ParagraphSection extends BaseConstructorSection {
  kind: 'paragraph';
  /**
   * TipTap HTML output, restricted to:
   *   <p>, <strong>, <em>, <u>, <ul>, <ol>, <li>, <br>
   * Other tags are stripped via sanitize-html before rendering.
   */
  html: string;
}

export interface RichTextBlockSection extends BaseConstructorSection {
  kind: RichTextBlockKind;
  html: string;
}

export interface ImageSection extends BaseConstructorSection {
  kind: 'image';
  /** `submission_files.id` of an image uploaded with kind=figure. */
  fileId: string | null;
  altText: string;
  /** Author-authored caption text. The "Figure N: " prefix is added on render. */
  caption: string;
}

export interface TableSection extends BaseConstructorSection {
  kind: 'table';
  caption: string;
  hasHeaderRow: boolean;
  rows: string[][];
  /** Plain-text table note below the grid (TableNote style in docx). */
  notes?: string;
}

export interface EquationSection extends BaseConstructorSection {
  kind: 'equation';
  latex: string;
  numbered: boolean;
  /** Omit on save — docx/preview derive "(1)", "(2)" from document order when numbered. */
  label?: string;
}

export interface ReferencesSection extends BaseConstructorSection {
  kind: 'references';
  items: ConstructorReferenceEntry[];
}

export interface ConstructorAuthorEntry {
  fullName: string;
  title: string;
  affiliation: string;
  email: string;
  isCorresponding: boolean;
}

export interface ConstructorReferenceEntry {
  lang: 'ar' | 'en';
  /** Sanitized TipTap HTML for the bibliography line. */
  html: string;
  /**
   * Legacy plain-text line from older drafts; migrated to `html` on save when set
   * without `html`.
   */
  text?: string;
  doi?: string;
}

export type ConstructorSection =
  | TitleSection
  | AuthorsSection
  | AbstractSection
  | HeadingSection
  | ParagraphSection
  | RichTextBlockSection
  | ImageSection
  | TableSection
  | EquationSection
  | ReferencesSection;

export interface ConstructorContent {
  defaultDir: ConstructorDir;
  /** Curated profile id; see `GET /public/manuscript-styles`. Omitted → server default. */
  manuscriptStyleId?: string;
  sections: ConstructorSection[];
}

/** Resolves a section's direction: explicit override → document default. */
export function resolveSectionDir(
  section: ConstructorSection,
  defaultDir: ConstructorDir,
): ConstructorDir {
  if (section.kind === 'abstract') {
    return section.lang === 'ar' ? 'rtl' : 'ltr';
  }
  return section.dir ?? defaultDir;
}

/**
 * Validation error contract shared by:
 *   - submit-time backend checks (returned as 400 body)
 *   - frontend ValidationBanner live checks
 */
export interface ConstructorValidationError {
  code: string;
  message: string;
  sectionId?: string;
}

export type ConstructorGuidance = {
  extraMandatorySlots?: RichTextBlockKind[];
  recommendedPresets?: ConstructorPresetId[];
  requiredRichTextKinds?: RichTextBlockKind[];
};
