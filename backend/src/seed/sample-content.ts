import type { CreateSubmissionDto } from '../submissions/dto/create-submission.dto';
import { SubmissionArticleType } from '../entities/submission-article-type.enum';
import {
  journalSlugForSampleLabel,
  type SeededPress,
} from '../journals/seed-journals';

/** AraBERT-style labels for dev samples when ai-service is off or unreachable. */
export const SAMPLE_DISCIPLINE_DEFAULT = 'العلوم الاقتصادية والسياسية';
export const SAMPLE_DISCIPLINE_MEDICAL = 'العلوم الطبية';
export const SAMPLE_DISCIPLINE_EDUCATION = 'العلوم التربوية والنفسية';
export const SAMPLE_DISCIPLINE_LEGAL = 'العلوم القانونية';
export const SAMPLE_DISCIPLINE_ENGINEERING = 'العلوم الهندسية';

export const SAMPLE_TITLE_PREFIX = '[Demo]';

/** Stable assignment slug for the dev invite sample (matches slugified title). */
export const SAMPLE_INVITE_PENDING_ASSIGNMENT_SLUG =
  'demo-open-access-policies-arabic-journals-pending-review--invite';

export const SAMPLE_INVITE_PENDING_LEGACY_TITLE = `${SAMPLE_TITLE_PREFIX} Open-Access Policies in Arabic Peer-Reviewed Journals (Pending Review)`;

export const SAMPLE_DRAFT_TITLE = `${SAMPLE_TITLE_PREFIX} Measuring Digital Learning Competencies Among University Students`;
export const SAMPLE_QUEUE_TITLE = `${SAMPLE_TITLE_PREFIX} Open-Access Policies in Arabic Peer-Reviewed Journals: A Comparative Study`;
export const SAMPLE_REVIEW_TITLE = `${SAMPLE_TITLE_PREFIX} Digital Publishing and Open-Access Policy Frameworks in Arabic Scholarly Journals`;
export const SAMPLE_COMPLETED_TITLE = `${SAMPLE_TITLE_PREFIX} Personal Data Protection in Contemporary Arab Legislation`;
export const SAMPLE_REVISIONS_TITLE = `${SAMPLE_TITLE_PREFIX} The Effect of Immediate Feedback on Student Performance in Large Classes`;
export const SAMPLE_INVITE_PENDING_TITLE = `${SAMPLE_TITLE_PREFIX} Open-Access Policies in Arabic Peer-Reviewed Journals (Pending Review)`;
export const SAMPLE_COPYEDIT_TITLE = `${SAMPLE_TITLE_PREFIX} Improving Wireless Sensor Network Efficiency in Industrial Environments`;
export const SAMPLE_PUBLISHED_TITLE = `${SAMPLE_TITLE_PREFIX} Digital Publishing Policies and Knowledge Economics in Arabic Journals`;
export const SAMPLE_PUBLISHED_PEER_TITLE = `${SAMPLE_TITLE_PREFIX} Open-Access Policies and Knowledge Economics in Arabic Peer-Reviewed Journals`;
export const SAMPLE_PUBLISHED_MEDICAL_TITLE = `${SAMPLE_TITLE_PREFIX} Research Ethics in Small-Sample Clinical Studies`;

/** Arabic + keyword bundles for workflow samples (distinct disciplines / corpus themes). */
export const SAMPLE_DRAFT_META = {
  titleAr: 'قياس كفايات التعلم الرقمي لدى طلاب المرحلة الجامعية',
  abstractAr:
    'تهدف الدراسة إلى بناء مقياس لكفايات التعلم الرقمي واختبار أثر التغذية الراجعة الفورية على التحصيل في مقررات التعليم العالي. تُطبَّق أدوات استبانة وتحليل عاملي على عينة من 240 طالباً وطالبة في جامعتين خلال الفصل الدراسي 2024–2025.',
  keywords:
    'digital learning, higher education, assessment, psychology, motivation',
  keywordsAr: 'تعلم رقمي, تعليم عال, قياس, تحفيز, علم نفس',
} as const;

/** Overlaps published open-access sample for corpus-similarity demos. */
export const SAMPLE_QUEUE_META = {
  titleAr: 'سياسات الوصول المفتوح في المجلات المحكّمة العربية: دراسة مقارنة',
  abstractAr:
    'يحلل البحث أثر سياسات الوصول المفتوح والنشر الرقمي على انتشار المعرفة الاقتصادية في المجلات العربية، ويقارن نماذج التمويل والرسوم بين عشر مجلات محكّمة خلال 2020–2024. تُستخلص توصيات لتوسيع الوصول دون الإضرار باستدامة النشر الأكاديمي.',
  keywords:
    'open access, digital publishing, economics, arabic journals, policy',
  keywordsAr: 'وصول مفتوح, نشر رقمي, اقتصاد, مجلات عربية, سياسات',
} as const;

export const SAMPLE_REVIEW_META = SAMPLE_QUEUE_META;

export const SAMPLE_COMPLETED_META = {
  titleAr: 'حماية البيانات الشخصية في التشريعات العربية المعاصرة',
  abstractAr:
    'تستعرض الدراسة أحكام حماية البيانات الشخصية في تشريعات مختارة من العالم العربي وتقارنها بمبادئ اللائحة العامة لحماية البيانات. يركز التحليل على موافقة صاحب البيانات، نقل البيانات عبر الحدود، ومسؤولية المراقب، مع توصيات لتقريب الأطر الوطنية.',
  keywords:
    'privacy law, data protection, legislation, compliance, arab region',
  keywordsAr: 'خصوصية, حماية بيانات, تشريع, امتثال, قانون',
} as const;

export const SAMPLE_REVISIONS_META = {
  titleAr: 'تأثير التغذية الراجعة الفورية على أداء الطلاب في الفصول الكبيرة',
  abstractAr:
    'تختبر الدراسة تجريبياً برنامج تغذية راجعة فورية عبر منصة تعلم إلكتروني في مقرر مقدمة الإحصاء. تُقارن نتائج الاختبارات القصيرة والمشروع النهائي بين مجموعتين، مع تحليل وصفية لانطباعات الطلاب حول وضوح التعليمات وقسم المنهجيات.',
  keywords:
    'formative assessment, feedback, large classes, pedagogy, learning outcomes',
  keywordsAr: 'تقويم, تغذية راجعة, تعليم, نتائج تعلم, منهجيات',
} as const;

export const SAMPLE_COPYEDIT_META = {
  titleAr: 'تحسين كفاءة شبكات الاستشعار اللاسلكية في البيئات الصناعية',
  abstractAr:
    'يقترح البحث بروتوكول توجيه موفر للطاقة لشبكات الاستشعار اللاسلكية في مصانع تعتمد إنترنت الأشياء. تُقارن المحاكاة زمن الاستجابة واستهلاك الطاقة مع بروتوكولات مرجعية على ثلاثة سيناريوهات حمل، مع مناقشة قابلية النشر في بيئات الضوضاء العالية.',
  keywords:
    'wireless sensor networks, industrial IoT, energy efficiency, routing, reliability',
  keywordsAr: 'شبكات لاسلكية, استشعار, كفاءة طاقة, صناعة, موثوقية',
} as const;

/** Arabic + keyword bundles for published-catalog samples (distinct embeddings). */
export const SAMPLE_PUB1_META = {
  titleAr: 'سياسات النشر الرقمي والاقتصاد المعرفي في المجلات العربية',
  abstractAr:
    'يستعرض هذا البحث أثر سياسات الوصول المفتوح على انتشار المعرفة الاقتصادية، ويقارن نماذج تمويل النشر بين المجلات المحكّمة العربية والدولية. تُستخدم منهجية تحليل وثائقي لعينة من سياسات النشر لدى عشر مجلات خلال 2020–2024.',
  keywords:
    'open access, digital publishing, economics, arabic journals, policy',
  keywordsAr: 'وصول مفتوح, نشر رقمي, اقتصاد, مجلات عربية, سياسات',
} as const;

/** Near-duplicate of SAMPLE_PUB1_META for related-articles / semantic similarity demos. */
export const SAMPLE_PUB2_META = {
  titleAr:
    'سياسات الوصول المفتوح والاقتصاد المعرفي في المجلات العربية المحكّمة',
  abstractAr:
    'يحلل هذا البحث أثر سياسات الوصول المفتوح على انتشار المعرفة الاقتصادية، ويقارن نماذج تمويل النشر بين المجلات المحكّمة العربية والدولية. تُطبَّق منهجية تحليل وثائقي على عينة من سياسات النشر لدى عشر مجلات خلال 2020–2024، مع توصيات لتوسيع الوصول دون الإضرار باستدامة النشر الأكاديمي.',
  keywords:
    'open access, digital publishing, economics, arabic journals, policy',
  keywordsAr: 'وصول مفتوح, نشر رقمي, اقتصاد, مجلات عربية, سياسات',
} as const;

export const SAMPLE_PUB3_META = {
  articleType: SubmissionArticleType.CASE_REPORT,
  titleAr: 'أخلاقيات البحوث السريرية ذات العينات الصغيرة',
  abstractAr:
    'يناقش المقال تحديات الموافقة المستنيرة والسرية في الدراسات السريرية محدودة العينة، مع التركيز على سياقات المستشفيات التعليمية. يقدّم الباحثون توصيات عملية لمراجعات الأخلاقيات المؤسسية عند ضعف القدرة الإحصائية.',
  // Exactly five per language — `assertReadyForSubmit` rejects any other count.
  keywords:
    'clinical research, research ethics, small samples, IRB, informed consent',
  keywordsAr:
    'بحوث سريرية, أخلاقيات, عينات صغيرة, لجان أخلاقيات, الموافقة المستنيرة',
} as const;

export type SampleMetaOverrides = Pick<
  CreateSubmissionDto,
  'titleAr' | 'abstractAr' | 'keywords' | 'keywordsAr' | 'articleType'
>;

/**
 * The journal a demo manuscript is created in — the same discipline-to-slug
 * rule `placeDemoSubmissions` sweeps with, applied up front because
 * `submissions.journal_id` is NOT NULL since slice 6. It stands in for the
 * choice a real author makes in the picker.
 */
export function seedJournalId(
  press: SeededPress,
  disciplineLabel?: string | null,
): string {
  const slug = journalSlugForSampleLabel(disciplineLabel);
  const journal = press.journalsBySlug.get(slug);
  if (!journal) {
    throw new Error(`Seed: no journal row for slug "${slug}"`);
  }
  return journal.id;
}

/** Journal form fields for a published sample; overrides generic Arabic boilerplate. */
export function samplePublicationMetadata(
  journalId: string,
  overrides: SampleMetaOverrides,
): Omit<CreateSubmissionDto, 'title' | 'abstract'> {
  return { ...sampleJournalMetadata(journalId), ...overrides };
}

/** Shared journal form fields; pair with a SAMPLE_*_META bundle for Arabic text. */
export function sampleJournalMetadata(
  journalId: string,
): Omit<
  CreateSubmissionDto,
  'title' | 'abstract' | 'titleAr' | 'abstractAr' | 'keywords' | 'keywordsAr'
> {
  return {
    journalId,
    articleType: SubmissionArticleType.ORIGINAL_RESEARCH,
    contributors: [
      {
        fullName: 'A. Researcher',
        email: 'author@folio.dev',
        affiliation: 'Faculty of Information Studies, Arab Open University',
        sortOrder: 0,
        isCorresponding: true,
      },
    ],
    fundingStatement:
      'Supported by Research Grant AOF-2024-001, Arab Open University Research Fund.',
    conflictOfInterestStatement: 'The authors declare no competing interests.',
    ethicalApprovalReference: 'N/A — no human or animal subjects.',
    originalityConfirmed: true,
    aiUsageStatement:
      'Generative AI was not used to draft the manuscript or analyze data.',
  };
}
