/**
 * Executable publication style for Word constructor → `.docx`.
 *
 * Covers typography and house conventions baked into the generated document
 * (e.g. reference list ordering for Damascus). Editorial policy such as word
 * limits belongs on submission/journal validation — not here.
 */
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
    figureCaptionAfterImage: boolean;
    tableCaptionBeforeTable: boolean;
  };
  references: {
    arabicFirst: boolean;
    headingText: string;
    entrySpacing: { before: number; after: number };
  };
  /** Safe projection for `GET /public/manuscript-styles` — see {@link ManuscriptPreviewTheme}. */
  previewTheme: ManuscriptPreviewTheme;
  /** Word constructor editorial rules (optional per profile). */
  constructor?: ManuscriptConstructorGuidance;
}

export interface ManuscriptConstructorGuidanceDto {
  extraMandatorySlots?: ConstructorRichTextKind[];
  recommendedPresets?: ConstructorPresetId[];
  requiredRichTextKinds?: ConstructorRichTextKind[];
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
