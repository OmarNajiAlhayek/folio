/**
 * Frontend mirror of `backend/src/submissions/constructor-content.types.ts`.
 * Kept manually in sync — when the backend shape changes, update both.
 */

export type ConstructorDir = "ltr" | "rtl";

export type ConstructorPresetId =
  | "introduction"
  | "literatureReview"
  | "materialsAndMethods"
  | "resultsAndDiscussion"
  | "conclusions";

export type ConstructorSectionKind =
  | "title"
  | "authors"
  | "abstract"
  | "heading1"
  | "heading2"
  | "heading3"
  | "paragraph"
  | "image"
  | "table"
  | "references"
  | "acknowledgments"
  | "funding"
  | "conflictOfInterest"
  | "dataAvailability"
  | "equation";

export type RichTextBlockKind =
  | "acknowledgments"
  | "funding"
  | "conflictOfInterest"
  | "dataAvailability";

export interface BaseConstructorSection {
  id: string;
  kind: ConstructorSectionKind;
  dir?: ConstructorDir;
  dirSource?: "auto" | "manual";
  /** When true, the section is mandatory and its remove button is disabled. */
  pinned?: boolean;
  presetSourceId?: ConstructorPresetId;
}

export interface TitleSection extends BaseConstructorSection {
  kind: "title";
  text: string;
  /** Distinguishes bilingual title sections (EN vs AR). Optional for backward compat. */
  lang?: "en" | "ar";
}

export interface AuthorsSection extends BaseConstructorSection {
  kind: "authors";
  authors: ConstructorAuthorEntry[];
}

export interface AbstractSection extends BaseConstructorSection {
  kind: "abstract";
  lang: "en" | "ar";
  text: string;
  keywords: string;
}

export interface HeadingSection extends BaseConstructorSection {
  kind: "heading1" | "heading2" | "heading3";
  text: string;
}

export interface ParagraphSection extends BaseConstructorSection {
  kind: "paragraph";
  /** TipTap HTML output, restricted to <p>, <strong>, <em>, <u>, <ul>, <ol>, <li>, <br>. */
  html: string;
}

export interface RichTextBlockSection extends BaseConstructorSection {
  kind: RichTextBlockKind;
  html: string;
}

export interface ImageSection extends BaseConstructorSection {
  kind: "image";
  fileId: string | null;
  altText: string;
  caption: string;
}

export interface TableSection extends BaseConstructorSection {
  kind: "table";
  caption: string;
  hasHeaderRow: boolean;
  rows: string[][];
  notes?: string;
}

export interface EquationSection extends BaseConstructorSection {
  kind: "equation";
  latex: string;
  numbered: boolean;
  label?: string;
}

export interface ReferencesSection extends BaseConstructorSection {
  kind: "references";
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
  lang: "ar" | "en";
  text: string;
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
  /** Curated profile id from `GET /public/manuscript-styles`. Omitted → server default. */
  manuscriptStyleId?: string;
  sections: ConstructorSection[];
}

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

/** Shape used by the multi-tab BroadcastChannel and localStorage envelope. */
export interface ConstructorDraftEnvelope {
  content: ConstructorContent;
  lastModified: string;
  tabId: string;
}
