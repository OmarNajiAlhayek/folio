/**
 * Executable publication style for Word constructor → `.docx`.
 *
 * Covers typography and house conventions baked into the generated document
 * (e.g. reference list ordering for Damascus). Editorial policy such as word
 * limits belongs on submission/journal validation — not here.
 */
import type { CitationStyleRule } from './citation-style';

export type ManuscriptAlignment = 'left' | 'center' | 'right';

export interface ManuscriptParagraphStyleDef {
  id: string;
  name: string;
  basedOn: string;
  next: string;
  run: { bold?: boolean; sizeHalfPoints: number };
  paragraph: {
    alignment: ManuscriptAlignment;
    spacingBefore?: number;
    spacingAfter?: number;
  };
}

/**
 * Subset of {@link ManuscriptStyleProfile} exposed on the **public** catalog API
 * for CSS preview only. Do not add non-public or sensitive fields here.
 */
export interface ManuscriptPreviewTheme {
  fontFamilyLatinStack: string;
  fontFamilyArabicStack: string;
  figureCaptionBelowImage: boolean;
  tableCaptionAboveTable: boolean;
  referencesArabicFirst: boolean;
  /** Caption prefix in generated .docx (preview uses the same). */
  figureWord: string;
  tableWord: string;
  referencesHeading: string;
  /** Left-to-right counterparts of the words above; fall back to them when absent. */
  figureWordLtr?: string;
  tableWordLtr?: string;
  referencesHeadingLtr?: string;
  captionNumberFormat?: ManuscriptCaptionNumberFormat;
  referencesNumbered?: boolean;
  /** Same rule as `references.citationStyles`, so the preview orders entries like the .docx. */
  citationStyles?: CitationStyleRule;
  tableBorders?: ManuscriptTableBorders;
  /** See {@link ManuscriptFrontMatterLayout.bilingualPages}. */
  bilingualFrontMatter?: boolean;
}

/** `colon` → "Table 1: caption"; `parenthesized` → "الجدول (1) caption". */
export type ManuscriptCaptionNumberFormat = 'colon' | 'parenthesized';

/** `grid` → every cell ruled; `horizontalRules` → heavy top/bottom, thin rules between rows, no verticals. */
export type ManuscriptTableBorders = 'grid' | 'horizontalRules';

export interface ManuscriptSideBoxLabels {
  received: string;
  accepted: string;
  copyrightLabel: string;
  copyright: string;
}

export interface ManuscriptFrontMatterLayout {
  /**
   * Title, authors and abstract in the article's language on page 1, the same
   * block in the other language on page 2, and the body from page 3.
   */
  bilingualPages: boolean;
  /**
   * Start-side indent (twips) keeping front matter clear of the side box. Word
   * reads `w:ind/@w:left` as the start edge of a right-to-left paragraph.
   */
  sideColumnIndentTwips: number;
  /**
   * Submission/acceptance dates and licence, floated on the start side of each
   * language block (right of the Arabic page, left of the English page).
   */
  sideBox: {
    widthTwips: number;
    /** Distance from the page edge on the start side. */
    pageEdgeOffsetTwips: number;
    ar: ManuscriptSideBoxLabels;
    en: ManuscriptSideBoxLabels;
  };
}

/** Running headers and footers copied from the journal's Word template. */
export interface ManuscriptPageFurniture {
  /** Running header and footer text size. */
  sizeHalfPoints: number;
  firstPageHeader: {
    journalAr: string;
    issueLineAr: string;
    journalEn: string;
    issueLineEn: string;
    sizeHalfPoints: number;
  };
  issnLabel: string;
  websiteUrl: string;
  /** Joins "page N <word> total" — "من" / "of". */
  pageOfAr: string;
  pageOfEn: string;
}

export type ConstructorPresetId =
  | 'introduction'
  | 'literatureReview'
  | 'materialsAndMethods'
  | 'resultsAndDiscussion'
  | 'conclusions';

export type ConstructorRichTextKind =
  | 'acknowledgments'
  | 'funding'
  | 'conflictOfInterest'
  | 'dataAvailability';

export interface ManuscriptConstructorGuidance {
  extraMandatorySlots?: ConstructorRichTextKind[];
  recommendedPresets?: ConstructorPresetId[];
  requiredRichTextKinds?: ConstructorRichTextKind[];
  /** Default text direction for newly created documents using this style. */
  defaultDocumentDir?: 'ltr' | 'rtl';
}

export interface ManuscriptStyleProfile {
  id: string;
  version: number;
  /** next-intl key: `manuscriptStyles.<id>.displayName` */
  displayNameKey: string;
  /** next-intl key: `manuscriptStyles.<id>.description` */
  descriptionKey: string;
  fonts: { latin: string; arabic: string };
  sizesHalfPoints: {
    bodyLatin: number;
    bodyArabic: number;
    caption: number;
    /** Main article title (both languages). */
    title: number;
    /** Subheadings; also the size the upload checker expects for heading paragraphs. */
    heading1: number;
    heading2: number;
    heading3: number;
  };
  pageMarginsMm: {
    top: number;
    bottom: number;
    left: number;
    right: number;
    header: number;
    footer: number;
  };
  /** Single line spacing (Word twips); 240 ≈ single for default grid. */
  documentLineSpacingTwips: number;
  documentParagraphSpacing: { before: number; after: number };
  headingParagraphSpacing: {
    heading1: { before: number; after: number };
    heading2: { before: number; after: number };
    heading3: { before: number; after: number };
  };
  numbering: {
    bulletReference: string;
    decimalReference: string;
  };
  paragraphStyles: ManuscriptParagraphStyleDef[];
  captions: {
    figureWord: string;
    tableWord: string;
    /** Used for left-to-right captions; defaults to `figureWord` / `tableWord`. */
    figureWordLtr?: string;
    tableWordLtr?: string;
    /** Defaults to `colon`. */
    numberFormat?: ManuscriptCaptionNumberFormat;
    figureCaptionAfterImage: boolean;
    tableCaptionBeforeTable: boolean;
  };
  references: {
    arabicFirst: boolean;
    headingText: string;
    /** Heading for left-to-right documents; defaults to `headingText`. */
    headingTextLtr?: string;
    /** Number entries 1., 2., … across the whole list. */
    numbered?: boolean;
    entrySpacing: { before: number; after: number };
    /**
     * Citation style per journal. `vancouver` keeps the author's entry order
     * (order of first citation) instead of sorting.
     * Absent → APA for every journal.
     */
    citationStyles?: CitationStyleRule;
  };
  /** Defaults to `grid`. */
  tableBorders?: ManuscriptTableBorders;
  /** Insert an empty paragraph before each heading, as the template spaces sections. */
  blankLineBeforeHeadings?: boolean;
  frontMatter?: ManuscriptFrontMatterLayout;
  pageFurniture?: ManuscriptPageFurniture;
  /** Safe projection for `GET /public/manuscript-styles` — see {@link ManuscriptPreviewTheme}. */
  previewTheme: ManuscriptPreviewTheme;
  /**
   * When true the generated .docx numbers every line continuously — on the left
   * for right-to-left articles, on the right for left-to-right ones.
   * Defaults to false when absent.
   */
  lineNumbers?: boolean;
  /**
   * Font size for footnote / endnote body text in half-points (§2: 10 pt = 20).
   * Falls back to `sizesHalfPoints.bodyLatin` when absent.
   */
  footnoteSizeHalfPoints?: number;
  /** Word constructor editorial rules (optional per profile). */
  constructorGuidance?: ManuscriptConstructorGuidance;
  /**
   * Minimum number of references that must cite articles already published in
   * this journal. Checked at submit time against the constructor reference list.
   * Omit (or set to 0) to disable the check.
   */
  minJournalSelfCitations?: number;
}

export interface ManuscriptConstructorGuidanceDto {
  extraMandatorySlots?: ConstructorRichTextKind[];
  recommendedPresets?: ConstructorPresetId[];
  requiredRichTextKinds?: ConstructorRichTextKind[];
  defaultDocumentDir?: 'ltr' | 'rtl';
}

export interface ManuscriptStyleCatalogEntryDto {
  id: string;
  version: number;
  displayNameKey: string;
  descriptionKey: string;
  previewTheme: ManuscriptPreviewTheme;
  constructorGuidance?: ManuscriptConstructorGuidanceDto;
}

/**
 * `defaultStyleId` reflects env `DEFAULT_MANUSCRIPT_STYLE_ID` when set and valid;
 * do not assume this payload is static across deployments or config changes.
 */
export interface ManuscriptStyleCatalogResponseDto {
  defaultStyleId: string;
  styles: ManuscriptStyleCatalogEntryDto[];
}
