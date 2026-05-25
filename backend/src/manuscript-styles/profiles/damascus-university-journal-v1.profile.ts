import type { ManuscriptStyleProfile } from '../manuscript-style.types';

const PROFILE_ID = 'damascus-university-journal-v1';

const damascusUniversityJournalV1Core = {
  id: PROFILE_ID,
  version: 1,
  displayNameKey: `manuscriptStyles.${PROFILE_ID}.displayName`,
  descriptionKey: `manuscriptStyles.${PROFILE_ID}.description`,
  fonts: {
    latin: 'Times New Roman',
    arabic: 'Simplified Arabic',
  },
  sizesHalfPoints: {
    bodyLatin: 22,
    bodyArabic: 24,
    caption: 20,
    heading1: 32,
    heading2: 28,
    heading3: 24,
  },
  pageMarginsMm: {
    top: 30,
    bottom: 20,
    left: 20,
    right: 20,
    header: 18,
    footer: 6,
  },
  documentLineSpacingTwips: 240,
  documentParagraphSpacing: { before: 0, after: 0 },
  headingParagraphSpacing: {
    heading1: { before: 240, after: 120 },
    heading2: { before: 200, after: 100 },
    heading3: { before: 160, after: 80 },
  },
  numbering: {
    bulletReference: 'constructor-bullet',
    decimalReference: 'constructor-decimal',
  },
  paragraphStyles: [
    {
      id: 'FigureCaption',
      name: 'Figure Caption',
      basedOn: 'Normal',
      next: 'Normal',
      run: { bold: true, sizeHalfPoints: 20 },
      paragraph: {
        alignment: 'center',
        spacingBefore: 80,
        spacingAfter: 200,
      },
    },
    {
      id: 'TableCaption',
      name: 'Table Caption',
      basedOn: 'Normal',
      next: 'Normal',
      run: { bold: true, sizeHalfPoints: 20 },
      paragraph: {
        alignment: 'center',
        spacingBefore: 200,
        spacingAfter: 80,
      },
    },
    {
      id: 'TableNote',
      name: 'Table Note',
      basedOn: 'Normal',
      next: 'Normal',
      run: { sizeHalfPoints: 20 },
      paragraph: { alignment: 'left', spacingBefore: 40, spacingAfter: 80 },
    },
  ],
  captions: {
    figureWord: 'Figure',
    tableWord: 'Table',
    figureCaptionAfterImage: true,
    tableCaptionBeforeTable: true,
  },
  references: {
    arabicFirst: true,
    headingText: 'References',
    entrySpacing: { before: 60, after: 60 },
  },
  constructor: {
    recommendedPresets: [
      'introduction',
      'literatureReview',
      'materialsAndMethods',
      'resultsAndDiscussion',
      'conclusions',
    ],
    requiredRichTextKinds: [],
    extraMandatorySlots: [],
  },
  previewTheme: {
    fontFamilyLatinStack: '"Times New Roman", "Liberation Serif", serif',
    fontFamilyArabicStack:
      '"Simplified Arabic", "Noto Naskh Arabic", serif',
    figureCaptionBelowImage: true,
    tableCaptionAboveTable: true,
    referencesArabicFirst: true,
    figureWord: 'Figure',
    tableWord: 'Table',
    referencesHeading: 'References',
  },
} satisfies ManuscriptStyleProfile;

export const damascusUniversityJournalV1: ManuscriptStyleProfile =
  damascusUniversityJournalV1Core;

export const DEFAULT_FALLBACK_MANUSCRIPT_STYLE_ID = PROFILE_ID;
