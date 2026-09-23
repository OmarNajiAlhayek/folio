import type { ArabicDisciplineLabel } from '../../ai/discipline-labels';
import type { CitationStyle, CitationStyleRule } from '../citation-style';
import type { ManuscriptStyleProfile } from '../manuscript-style.types';

const PROFILE_ID = 'damascus-university-journal-v1';

// Editorial decision: APA for every journal, Vancouver for the medical journal.
// Keyed by `Journal.disciplineLabel`, so the manuscript's journal decides.
const CITATION_STYLES: CitationStyleRule = {
  default: 'apa',
  byDisciplineLabel: {
    'العلوم الطبية': 'vancouver',
  } satisfies Partial<Record<ArabicDisciplineLabel, CitationStyle>>,
};

/**
 * Damascus University Journal author template ("قالب البحث لنشر مقال في جامعة
 * دمشق"). Page references (p.N) are to the nine-page guideline; the spec lives in
 * `docs/styles/damascus-university-journal-v1.md`.
 */
const damascusUniversityJournalV1Core = {
  id: PROFILE_ID,
  version: 1,
  displayNameKey: `manuscriptStyles.${PROFILE_ID}.displayName`,
  descriptionKey: `manuscriptStyles.${PROFILE_ID}.description`,
  fonts: {
    latin: 'Times New Roman',
    arabic: 'Simplified Arabic',
  },
  // p.4: body Simplified Arabic 12 / Times New Roman 11; main title 16 bold in
  // both languages; every subheading 14 bold. p.6–7: table and figure captions,
  // table notes and footnotes 10.
  sizesHalfPoints: {
    bodyLatin: 22,
    bodyArabic: 24,
    caption: 20,
    title: 32,
    heading1: 28,
    heading2: 28,
    heading3: 28,
  },
  // p.3: margins top 3 cm, others 2 cm; header 1.8 cm from top, footer 0.6 cm.
  pageMarginsMm: {
    top: 30,
    bottom: 20,
    left: 20,
    right: 20,
    header: 18,
    footer: 6,
  },
  // p.3: single spacing, 0 pt before and after.
  documentLineSpacingTwips: 240,
  documentParagraphSpacing: { before: 0, after: 0 },
  headingParagraphSpacing: {
    heading1: { before: 0, after: 0 },
    heading2: { before: 0, after: 0 },
    heading3: { before: 0, after: 0 },
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
      paragraph: { alignment: 'center', spacingBefore: 0, spacingAfter: 0 },
    },
    {
      id: 'TableCaption',
      name: 'Table Caption',
      basedOn: 'Normal',
      next: 'Normal',
      run: { bold: true, sizeHalfPoints: 20 },
      paragraph: { alignment: 'center', spacingBefore: 0, spacingAfter: 0 },
    },
    {
      id: 'TableNote',
      name: 'Table Note',
      basedOn: 'Normal',
      next: 'Normal',
      run: { sizeHalfPoints: 20 },
      paragraph: { alignment: 'left', spacingBefore: 0, spacingAfter: 0 },
    },
  ],
  // p.6–7: "الجدول (1) نتيجة التجربة الأولى" above the table, "الشكل (1) …" below the figure.
  captions: {
    figureWord: 'الشكل',
    tableWord: 'الجدول',
    figureWordLtr: 'Figure',
    tableWordLtr: 'Table',
    numberFormat: 'parenthesized',
    figureCaptionAfterImage: true,
    tableCaptionBeforeTable: true,
  },
  // p.7: Arabic references first, alphabetical, numbered (APA). Vancouver
  // journals keep the author's order — the order of first citation.
  references: {
    arabicFirst: true,
    headingText: 'المراجع',
    headingTextLtr: 'References',
    numbered: true,
    entrySpacing: { before: 0, after: 0 },
    citationStyles: CITATION_STYLES,
  },
  // p.7: the sample table has horizontal rules only.
  tableBorders: 'horizontalRules',
  blankLineBeforeHeadings: true,
  // p.1–2: article-language block, page break, other-language block, page break, body.
  frontMatter: {
    bilingualPages: true,
    sideColumnIndentTwips: 2834,
    sideBox: {
      widthTwips: 2400,
      pageEdgeOffsetTwips: 300,
      ar: {
        received: 'تاريخ الإيداع',
        accepted: 'تاريخ القبول',
        copyrightLabel: 'حقوق النشر:',
        copyright:
          'جامعة دمشق – سورية، يحتفظ المؤلفون بحقوق النشر بموجب CC BY-NC-SA',
      },
      en: {
        received: 'Received:',
        accepted: 'Accepted:',
        copyrightLabel: 'Copyright:',
        copyright:
          'Damascus University- Syria, The authors retain the copyright under a CC BY-NC-SA',
      },
    },
  },
  // p.1–3: different first page; journal/issue header and ISSN footer on page 1,
  // then "title … author surnames" header and "N من M" footer.
  pageFurniture: {
    sizeHalfPoints: 16,
    firstPageHeader: {
      journalAr: 'مجلة جامعة دمشق للعلوم ....',
      issueLineAr: 'المجلد (العدد): الصفحات: ؟؟ - ؟؟ .',
      journalEn: 'Damascus university journal',
      issueLineEn: 'V… ( ):PP: ??-??',
      sizeHalfPoints: 20,
    },
    issnLabel: 'ISSN (online)',
    websiteUrl:
      'http://journal.damascusuniversity.edu.sy/index.php/index/index',
    pageOfAr: 'من',
    pageOfEn: 'of',
  },
  // p.3: number lines — left for Arabic articles, right for English ones.
  lineNumbers: true,
  footnoteSizeHalfPoints: 20,
  minJournalSelfCitations: 2,
  constructorGuidance: {
    defaultDocumentDir: 'rtl',
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
    fontFamilyArabicStack: '"Simplified Arabic", "Noto Naskh Arabic", serif',
    figureCaptionBelowImage: true,
    tableCaptionAboveTable: true,
    referencesArabicFirst: true,
    figureWord: 'الشكل',
    tableWord: 'الجدول',
    referencesHeading: 'المراجع',
    figureWordLtr: 'Figure',
    tableWordLtr: 'Table',
    referencesHeadingLtr: 'References',
    captionNumberFormat: 'parenthesized',
    referencesNumbered: true,
    citationStyles: CITATION_STYLES,
    tableBorders: 'horizontalRules',
    bilingualFrontMatter: true,
  },
} satisfies ManuscriptStyleProfile;

export const damascusUniversityJournalV1: ManuscriptStyleProfile =
  damascusUniversityJournalV1Core;

export const DEFAULT_FALLBACK_MANUSCRIPT_STYLE_ID = PROFILE_ID;
