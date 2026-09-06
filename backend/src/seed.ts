import 'reflect-metadata';
import { config } from 'dotenv';
import { randomUUID } from 'crypto';
import { extname, join } from 'path';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import * as bcrypt from 'bcrypt';
import { NestFactory } from '@nestjs/core';
import { DataSource, In, Like } from 'typeorm';
import { AppModule } from './app.module';
import { ROLE_SLUGS } from './rbac/permission-slugs';
import { RbacService } from './rbac/rbac.service';
import { UsersService } from './users/users.service';
import { SubmissionsService } from './submissions/submissions.service';
import type { RequestUser } from './common/types/request-user';
import { Submission } from './entities/submission.entity';
import { SubmissionFile } from './entities/submission-file.entity';
import {
  AssignmentStatus,
  ReviewAssignment,
} from './entities/review-assignment.entity';
import { Review, ReviewRecommendation } from './entities/review.entity';
import {
  CopyeditAssignment,
  CopyeditAssignmentStatus,
} from './entities/copyedit-assignment.entity';
import { CopyeditNote } from './entities/copyedit-note.entity';
import { SubmissionStatus } from './entities/submission-status.enum';
import { SubmissionArticleType } from './entities/submission-article-type.enum';
import { SubmissionFileStage } from './entities/submission-file-stage.enum';
import type { User } from './entities/user.entity';
import type { CreateSubmissionDto } from './submissions/dto/create-submission.dto';
import { AiClientService } from './ai/ai-client.service';
import { SubmissionDisciplineSource } from './entities/submission-discipline-source.enum';
import type { DisciplineClassificationJson } from './ai/ai-client.types';
import {
  labelsFromProbabilities,
  parseJournalAllowedDisciplines,
} from './ai/discipline-labels';
import { ensurePublicationSearchSchema } from './common/ensure-publication-search-schema';
import {
  assertSeedAllowed,
  describeSeedTarget,
  SeedNotAllowedError,
} from './seed-guard';
import {
  placeDemoSubmissions,
  seedPressFixtures,
} from './journals/seed-journals';

config({ path: join(__dirname, '..', '.env') });

/** AraBERT-style labels for dev samples when ai-service is off or unreachable. */
const SAMPLE_DISCIPLINE_DEFAULT = 'العلوم الاقتصادية والسياسية';
const SAMPLE_DISCIPLINE_MEDICAL = 'العلوم الطبية';
const SAMPLE_DISCIPLINE_EDUCATION = 'العلوم التربوية والنفسية';
const SAMPLE_DISCIPLINE_LEGAL = 'العلوم القانونية';
const SAMPLE_DISCIPLINE_ENGINEERING = 'العلوم الهندسية';

const SAMPLE_TITLE_PREFIX = '[Demo]';

/** Stable assignment slug for the dev invite sample (matches slugified title). */
const SAMPLE_INVITE_PENDING_ASSIGNMENT_SLUG =
  'demo-open-access-policies-arabic-journals-pending-review--invite';

const SAMPLE_INVITE_PENDING_LEGACY_TITLE = `${SAMPLE_TITLE_PREFIX} Open-Access Policies in Arabic Peer-Reviewed Journals (Pending Review)`;

function uploadRoot(): string {
  const rel = process.env.UPLOAD_DIR ?? join('..', 'uploads');
  return join(process.cwd(), rel);
}

/** Same `_tmp` layout as submission-file-multer diskStorage. */
function uploadTmpDir(): string {
  const tmp = join(uploadRoot(), '_tmp');
  if (!existsSync(tmp)) {
    mkdirSync(tmp, { recursive: true });
  }
  return tmp;
}

/** Writes a real temp file so SubmissionsService.addFile can rename it. */
function sampleMulterFile(
  originalname: string,
  buffer: Buffer,
): Express.Multer.File {
  const ext = extname(originalname).toLowerCase() || '.pdf';
  const filename = `${randomUUID()}${ext}`;
  const destination = uploadTmpDir();
  const path = join(destination, filename);
  writeFileSync(path, buffer);
  return {
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: buffer.length,
    destination,
    filename,
    path,
  } as Express.Multer.File;
}

/** Arabic + keyword bundles for workflow samples (distinct disciplines / corpus themes). */
const SAMPLE_DRAFT_META = {
  titleAr: 'قياس كفايات التعلم الرقمي لدى طلاب المرحلة الجامعية',
  abstractAr:
    'تهدف الدراسة إلى بناء مقياس لكفايات التعلم الرقمي واختبار أثر التغذية الراجعة الفورية على التحصيل في مقررات التعليم العالي. تُطبَّق أدوات استبانة وتحليل عاملي على عينة من 240 طالباً وطالبة في جامعتين خلال الفصل الدراسي 2024–2025.',
  keywords:
    'digital learning, higher education, assessment, psychology, motivation',
  keywordsAr: 'تعلم رقمي, تعليم عال, قياس, تحفيز, علم نفس',
} as const;

/** Overlaps published open-access sample for corpus-similarity demos. */
const SAMPLE_QUEUE_META = {
  titleAr: 'سياسات الوصول المفتوح في المجلات المحكّمة العربية: دراسة مقارنة',
  abstractAr:
    'يحلل البحث أثر سياسات الوصول المفتوح والنشر الرقمي على انتشار المعرفة الاقتصادية في المجلات العربية، ويقارن نماذج التمويل والرسوم بين عشر مجلات محكّمة خلال 2020–2024. تُستخلص توصيات لتوسيع الوصول دون الإضرار باستدامة النشر الأكاديمي.',
  keywords:
    'open access, digital publishing, economics, arabic journals, policy',
  keywordsAr: 'وصول مفتوح, نشر رقمي, اقتصاد, مجلات عربية, سياسات',
} as const;

const SAMPLE_REVIEW_META = SAMPLE_QUEUE_META;

const SAMPLE_COMPLETED_META = {
  titleAr: 'حماية البيانات الشخصية في التشريعات العربية المعاصرة',
  abstractAr:
    'تستعرض الدراسة أحكام حماية البيانات الشخصية في تشريعات مختارة من العالم العربي وتقارنها بمبادئ اللائحة العامة لحماية البيانات. يركز التحليل على موافقة صاحب البيانات، نقل البيانات عبر الحدود، ومسؤولية المراقب، مع توصيات لتقريب الأطر الوطنية.',
  keywords:
    'privacy law, data protection, legislation, compliance, arab region',
  keywordsAr: 'خصوصية, حماية بيانات, تشريع, امتثال, قانون',
} as const;

const SAMPLE_REVISIONS_META = {
  titleAr: 'تأثير التغذية الراجعة الفورية على أداء الطلاب في الفصول الكبيرة',
  abstractAr:
    'تختبر الدراسة تجريبياً برنامج تغذية راجعة فورية عبر منصة تعلم إلكتروني في مقرر مقدمة الإحصاء. تُقارن نتائج الاختبارات القصيرة والمشروع النهائي بين مجموعتين، مع تحليل وصفية لانطباعات الطلاب حول وضوح التعليمات وقسم المنهجيات.',
  keywords:
    'formative assessment, feedback, large classes, pedagogy, learning outcomes',
  keywordsAr: 'تقويم, تغذية راجعة, تعليم, نتائج تعلم, منهجيات',
} as const;

const SAMPLE_COPYEDIT_META = {
  titleAr: 'تحسين كفاءة شبكات الاستشعار اللاسلكية في البيئات الصناعية',
  abstractAr:
    'يقترح البحث بروتوكول توجيه موفر للطاقة لشبكات الاستشعار اللاسلكية في مصانع تعتمد إنترنت الأشياء. تُقارن المحاكاة زمن الاستجابة واستهلاك الطاقة مع بروتوكولات مرجعية على ثلاثة سيناريوهات حمل، مع مناقشة قابلية النشر في بيئات الضوضاء العالية.',
  keywords:
    'wireless sensor networks, industrial IoT, energy efficiency, routing, reliability',
  keywordsAr: 'شبكات لاسلكية, استشعار, كفاءة طاقة, صناعة, موثوقية',
} as const;

/** Arabic + keyword bundles for published-catalog samples (distinct embeddings). */
const SAMPLE_PUB1_META = {
  titleAr: 'سياسات النشر الرقمي والاقتصاد المعرفي في المجلات العربية',
  abstractAr:
    'يستعرض هذا البحث أثر سياسات الوصول المفتوح على انتشار المعرفة الاقتصادية، ويقارن نماذج تمويل النشر بين المجلات المحكّمة العربية والدولية. تُستخدم منهجية تحليل وثائقي لعينة من سياسات النشر لدى عشر مجلات خلال 2020–2024.',
  keywords:
    'open access, digital publishing, economics, arabic journals, policy',
  keywordsAr: 'وصول مفتوح, نشر رقمي, اقتصاد, مجلات عربية, سياسات',
} as const;

/** Near-duplicate of SAMPLE_PUB1_META for related-articles / semantic similarity demos. */
const SAMPLE_PUB2_META = {
  titleAr:
    'سياسات الوصول المفتوح والاقتصاد المعرفي في المجلات العربية المحكّمة',
  abstractAr:
    'يحلل هذا البحث أثر سياسات الوصول المفتوح على انتشار المعرفة الاقتصادية، ويقارن نماذج تمويل النشر بين المجلات المحكّمة العربية والدولية. تُطبَّق منهجية تحليل وثائقي على عينة من سياسات النشر لدى عشر مجلات خلال 2020–2024، مع توصيات لتوسيع الوصول دون الإضرار باستدامة النشر الأكاديمي.',
  keywords:
    'open access, digital publishing, economics, arabic journals, policy',
  keywordsAr: 'وصول مفتوح, نشر رقمي, اقتصاد, مجلات عربية, سياسات',
} as const;

const SAMPLE_PUB3_META = {
  articleType: SubmissionArticleType.CASE_REPORT,
  titleAr: 'أخلاقيات البحوث السريرية ذات العينات الصغيرة',
  abstractAr:
    'يناقش المقال تحديات الموافقة المستنيرة والسرية في الدراسات السريرية محدودة العينة، مع التركيز على سياقات المستشفيات التعليمية. يقدّم الباحثون توصيات عملية لمراجعات الأخلاقيات المؤسسية عند ضعف القدرة الإحصائية.',
  keywords: 'clinical research, research ethics, small samples, IRB',
  keywordsAr: 'بحوث سريرية, أخلاقيات, عينات صغيرة, لجان أخلاقيات',
} as const;

type SampleMetaOverrides = Pick<
  CreateSubmissionDto,
  'titleAr' | 'abstractAr' | 'keywords' | 'keywordsAr' | 'articleType'
>;

/** Journal form fields for a published sample; overrides generic Arabic boilerplate. */
function samplePublicationMetadata(
  overrides: SampleMetaOverrides,
): Omit<CreateSubmissionDto, 'title' | 'abstract'> {
  return { ...sampleJournalMetadata(), ...overrides };
}

/** Shared journal form fields; pair with a SAMPLE_*_META bundle for Arabic text. */
function sampleJournalMetadata(): Omit<
  CreateSubmissionDto,
  'title' | 'abstract' | 'titleAr' | 'abstractAr' | 'keywords' | 'keywordsAr'
> {
  return {
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

function sampleDisciplineClassification(
  topLabel: string,
  confidence: number,
  scopeInJournal: boolean,
): DisciplineClassificationJson {
  return {
    probabilities: {
      [topLabel]: confidence,
      'غير محدد': Math.max(0, 100 - confidence - 2),
    },
    classifiedAt: new Date().toISOString(),
    scopeInJournal,
    scopeWarning: scopeInJournal ? null : 'suggested_out_of_journal_scope',
  };
}

/**
 * Dev-only: ensure discipline suggestion exists for UI demos.
 * When submit() already stored AI output, still applies `confirmAsAuthor` so
 * `disciplines` are set for catalog filters and public API responses.
 */
async function syncSampleDiscipline(
  dataSource: DataSource,
  submissionId: string,
  options: {
    topLabel?: string;
    suggestedLabels?: string[];
    disciplines?: string[];
    confidence?: number;
    confirmAsAuthor?: boolean;
    force?: boolean;
  } = {},
): Promise<void> {
  const subRepo = dataSource.getRepository(Submission);
  const row = await subRepo.findOne({ where: { id: submissionId } });
  if (!row) {
    return;
  }

  const topLabel = options.topLabel ?? SAMPLE_DISCIPLINE_DEFAULT;
  const confidence = options.confidence ?? 88.5;
  const suggestedLabels =
    options.suggestedLabels ??
    labelsFromProbabilities(topLabel, {
      [topLabel]: confidence,
      'غير محدد': Math.max(0, 100 - confidence - 2),
    });

  if ((row.disciplines?.length ?? 0) > 0 && !options.force) {
    return;
  }

  if ((row.disciplineSuggestedLabels?.length ?? 0) > 0 && !options.force) {
    if (options.confirmAsAuthor) {
      row.disciplines = options.disciplines ?? suggestedLabels;
      row.disciplineSource = SubmissionDisciplineSource.AUTHOR;
      await subRepo.save(row);
    }
    return;
  }
  const allowed = parseJournalAllowedDisciplines(
    process.env.JOURNAL_ALLOWED_DISCIPLINES,
  );
  const scopeInJournal =
    allowed.length === 0
      ? true
      : suggestedLabels.some((label) => allowed.includes(label));

  row.disciplineSuggestedLabels = suggestedLabels;
  row.disciplineSuggestedConfidence = confidence.toFixed(2);
  row.disciplineClassification = sampleDisciplineClassification(
    topLabel,
    confidence,
    scopeInJournal,
  );
  if (options.confirmAsAuthor) {
    row.disciplines = options.disciplines ?? suggestedLabels;
    row.disciplineSource = SubmissionDisciplineSource.AUTHOR;
  }
  await subRepo.save(row);
}

function queueSampleDisciplineLabel(): string {
  const allowed = parseJournalAllowedDisciplines(
    process.env.JOURNAL_ALLOWED_DISCIPLINES,
  );
  if (allowed.length > 0 && !allowed.includes(SAMPLE_DISCIPLINE_MEDICAL)) {
    return SAMPLE_DISCIPLINE_MEDICAL;
  }
  return SAMPLE_DISCIPLINE_DEFAULT;
}

async function promoteManuscriptsToReviewPackage(
  dataSource: DataSource,
  submissionId: string,
): Promise<void> {
  await dataSource
    .getRepository(SubmissionFile)
    .update(
      { submissionId, kind: 'manuscript' },
      { fileStage: SubmissionFileStage.REVIEW },
    );
}

async function attachStandardFilePackage(
  submissionsService: SubmissionsService,
  slug: string,
  authorReq: RequestUser,
  pdfBytes: Buffer,
  manuscriptFilename: string,
) {
  await submissionsService.addFile(
    slug,
    authorReq,
    sampleMulterFile('cover-letter.pdf', pdfBytes),
    'cover_letter',
  );
  await submissionsService.addFile(
    slug,
    authorReq,
    sampleMulterFile('title-page.pdf', pdfBytes),
    'title_page',
  );
  await submissionsService.addFile(
    slug,
    authorReq,
    sampleMulterFile(manuscriptFilename, pdfBytes),
    'manuscript',
  );
}

/** Full workflow: create → submit → accept → copyedit → publish (public catalog). */
/** Ensure revision manuscript `created_at` is strictly after the copyedit note. */
async function sleepForRevisionTimestamp(): Promise<void> {
  await new Promise((r) => setTimeout(r, 25));
}

async function addRevisionManuscriptAfterNote(options: {
  submissionsService: SubmissionsService;
  submissionSlug: string;
  authorReq: RequestUser;
  revisionFilename: string;
  pdfBytes: Buffer;
}): Promise<void> {
  const {
    submissionsService,
    submissionSlug,
    authorReq,
    revisionFilename,
    pdfBytes,
  } = options;

  await sleepForRevisionTimestamp();
  await submissionsService.addFile(
    submissionSlug,
    authorReq,
    sampleMulterFile(revisionFilename, pdfBytes),
    'manuscript',
  );
}

async function resumePublishedSampleSeed(options: {
  dataSource: DataSource;
  submissionsService: SubmissionsService;
  author: User;
  authorReq: RequestUser;
  copyeditorReq: RequestUser;
  pdfBytes: Buffer;
  revisionFilename: string;
  existing: Submission;
  logLabel: string;
}): Promise<void> {
  const {
    dataSource,
    submissionsService,
    author,
    authorReq,
    copyeditorReq,
    pdfBytes,
    revisionFilename,
    existing,
    logLabel,
  } = options;

  if (!existing.slug) {
    throw new Error(
      `Cannot resume published sample without slug: ${existing.title}`,
    );
  }

  if (existing.status === SubmissionStatus.PUBLISHED) {
    return;
  }

  if (existing.status !== SubmissionStatus.COPYEDITING) {
    throw new Error(
      `Cannot resume published sample "${existing.title}" from status ${existing.status}`,
    );
  }

  const assignment = await dataSource
    .getRepository(CopyeditAssignment)
    .findOne({
      where: { submissionId: existing.id },
      order: { assignedAt: 'DESC' },
    });
  if (!assignment?.slug) {
    throw new Error(`Missing copyedit assignment for "${existing.title}"`);
  }

  if (assignment.status === CopyeditAssignmentStatus.AWAITING_AUTHOR) {
    await addRevisionManuscriptAfterNote({
      submissionsService,
      submissionSlug: existing.slug,
      authorReq,
      revisionFilename,
      pdfBytes,
    });
    await submissionsService.markCopyeditAuthorReady(
      assignment.slug,
      author.id,
    );
  } else if (assignment.status !== CopyeditAssignmentStatus.READY_FOR_REVIEW) {
    throw new Error(
      `Cannot resume published sample "${existing.title}" from assignment status ${assignment.status}`,
    );
  }

  await submissionsService.publishSubmission(existing.slug, copyeditorReq);
  console.log(`Resumed: ${existing.title} (${logLabel})`);
}

async function seedPublishedSample(options: {
  dataSource: DataSource;
  submissionsService: SubmissionsService;
  author: User;
  authorReq: RequestUser;
  editorReq: RequestUser;
  copyeditor: User;
  copyeditorReq: RequestUser;
  pdfBytes: Buffer;
  title: string;
  abstract: string;
  publicationMeta: SampleMetaOverrides;
  manuscriptFilename: string;
  revisionFilename: string;
  discipline: {
    topLabel: string;
    confidence: number;
    suggestedLabels?: string[];
    disciplines?: string[];
  };
  logLabel: string;
}): Promise<void> {
  const {
    dataSource,
    submissionsService,
    author,
    authorReq,
    editorReq,
    copyeditor,
    copyeditorReq,
    pdfBytes,
    title,
    abstract,
    publicationMeta,
    manuscriptFilename,
    revisionFilename,
    discipline,
    logLabel,
  } = options;

  const existing = await findSampleSubmission(dataSource, author.id, title);
  if (existing) {
    await syncSampleDiscipline(dataSource, existing.id, {
      topLabel: discipline.topLabel,
      confidence: discipline.confidence,
      suggestedLabels: discipline.suggestedLabels,
      disciplines: discipline.disciplines,
      confirmAsAuthor: true,
    });
    if (existing.status === SubmissionStatus.PUBLISHED) {
      return;
    }
    await resumePublishedSampleSeed({
      dataSource,
      submissionsService,
      author,
      authorReq,
      copyeditorReq,
      pdfBytes,
      revisionFilename,
      existing,
      logLabel,
    });
    return;
  }

  const s = await submissionsService.create(author.id, {
    title,
    abstract,
    ...samplePublicationMetadata(publicationMeta),
  });
  await attachStandardFilePackage(
    submissionsService,
    s.slug!,
    authorReq,
    pdfBytes,
    manuscriptFilename,
  );
  await submissionsService.submit(s.slug!, authorReq);
  await syncSampleDiscipline(dataSource, s.id, {
    topLabel: discipline.topLabel,
    confidence: discipline.confidence,
    suggestedLabels: discipline.suggestedLabels,
    disciplines: discipline.disciplines,
    confirmAsAuthor: true,
  });
  await submissionsService.updateStatus(
    s.slug!,
    editorReq,
    SubmissionStatus.ACCEPTED,
  );
  const ceAssignment = await submissionsService.assignCopyeditor(
    s.slug!,
    copyeditor.id,
    editorReq,
  );
  await submissionsService.submitCopyeditNote(
    ceAssignment.slug!,
    copyeditor.id,
    'Ready for catalog.',
    '',
  );
  await addRevisionManuscriptAfterNote({
    submissionsService,
    submissionSlug: s.slug!,
    authorReq,
    revisionFilename,
    pdfBytes,
  });
  await submissionsService.markCopyeditAuthorReady(
    ceAssignment.slug!,
    author.id,
  );
  await submissionsService.publishSubmission(s.slug!, copyeditorReq);
  console.log(`Seeded: ${title} (${logLabel})`);
}

async function toRequestUser(
  usersService: UsersService,
  rbacService: RbacService,
  userId: string,
): Promise<RequestUser> {
  const user = await usersService.findById(userId);
  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }
  const { roleSlugs, permissionSlugs } =
    await rbacService.getEffectiveForUser(userId);
  return {
    sub: userId,
    email: user.email,
    roleSlugs,
    permissionSlugs,
  };
}

async function ensureUser(
  usersService: UsersService,
  rbacService: RbacService,
  def: {
    email: string;
    password: string;
    displayName: string;
    roleSlugs: string[];
    profile?: {
      affiliation?: string | null;
      orcid?: string | null;
      reviewKeywords?: string | null;
      willingToReview?: boolean;
    };
  },
): Promise<User> {
  let user = await usersService.findByEmail(def.email);
  if (!user) {
    const passwordHash = await bcrypt.hash(def.password, 10);
    user = await usersService.create({
      email: def.email,
      passwordHash,
      displayName: def.displayName,
      affiliation: def.profile?.affiliation ?? null,
      orcid: def.profile?.orcid ?? null,
      reviewKeywords: def.profile?.reviewKeywords ?? null,
      willingToReview: def.profile?.willingToReview ?? false,
    });
  } else if (def.profile) {
    await usersService.patchResearcherProfile(user.id, def.profile);
  }
  await usersService.markEmailVerified(user.id);
  await rbacService.assignRoles(user.id, def.roleSlugs);
  return user;
}

const PERF_TITLE_PREFIX = '[Perf]';

function perfSubmissionMetadata(
  titleAr: string,
  abstractAr: string,
  keywords: string,
  keywordsAr: string,
): Omit<CreateSubmissionDto, 'title' | 'abstract'> {
  return {
    ...sampleJournalMetadata(),
    titleAr,
    abstractAr,
    keywords,
    keywordsAr,
  };
}
const PERF_EDITOR_EMAIL = 'editor@perf.local';
const PERF_EDITOR_PASSWORD = 'PerfEditor123!';
const PERF_AUTHOR_EMAIL = 'author@perf.local';
const PERF_AUTHOR_PASSWORD = 'PerfAuthor123!';
const PERF_MANAGER_EMAIL = 'manager@perf.local';
const PERF_MANAGER_PASSWORD = 'PerfManager123!';
const PERF_REVIEWER_PASSWORD = 'PerfReview123!';

type PerfFixturesFile = {
  editor: { email: string; password: string };
  manager: { email: string; password: string };
  author: { email: string; password: string };
  reviewSubmit: Array<{
    reviewerEmail: string;
    password: string;
    assignmentSlug: string;
  }>;
  emailPipeline: {
    invites: Array<{ submissionSlug: string; reviewerId: string }>;
  };
  corpusSimilarity: { submissionSlug: string };
  aiGrpcHost: string;
  editorQueue: { slugs: string[]; count: number };
  publishedCatalog: { count: number };
  uploadDraft: { slug: string };
  searchTerms: string[];
};

async function resetPerfSubmissions(dataSource: DataSource): Promise<void> {
  const subRepo = dataSource.getRepository(Submission);
  const perfRows = await subRepo.find({
    where: { title: Like(`${PERF_TITLE_PREFIX}%`) },
    select: ['id'],
  });
  if (perfRows.length === 0) return;
  const ids = perfRows.map((r) => r.id);

  const assignmentRepo = dataSource.getRepository(ReviewAssignment);
  const assignments = await assignmentRepo.find({
    where: { submissionId: In(ids) },
    select: ['id'],
  });
  const assignmentIds = assignments.map((a) => a.id);
  if (assignmentIds.length > 0) {
    await dataSource.getRepository(Review).delete({
      assignmentId: In(assignmentIds),
    });
  }
  await assignmentRepo.delete({ submissionId: In(ids) });
  await dataSource.getRepository(SubmissionFile).delete({
    submissionId: In(ids),
  });
  await subRepo.delete(ids);
  console.log(`SEED_PERF: removed ${ids.length} prior [Perf] submission(s)`);
}

async function seedPerfFixtures(options: {
  dataSource: DataSource;
  usersService: UsersService;
  rbacService: RbacService;
  submissionsService: SubmissionsService;
}): Promise<void> {
  const { dataSource, usersService, rbacService, submissionsService } = options;
  await resetPerfSubmissions(dataSource);
  const reviewCount = Math.max(
    1,
    parseInt(process.env.SEED_PERF_REVIEW_COUNT ?? '20', 10),
  );
  const emailCount = Math.max(
    1,
    parseInt(process.env.SEED_PERF_EMAIL_COUNT ?? '50', 10),
  );
  const queueCount = Math.max(
    0,
    parseInt(process.env.SEED_PERF_QUEUE_COUNT ?? '200', 10),
  );
  const publishedCount = Math.max(
    0,
    parseInt(process.env.SEED_PERF_PUBLISHED_COUNT ?? '100', 10),
  );

  const perfAuthor = await ensureUser(usersService, rbacService, {
    email: PERF_AUTHOR_EMAIL,
    password: PERF_AUTHOR_PASSWORD,
    displayName: 'Perf Author',
    roleSlugs: [ROLE_SLUGS.AUTHOR],
    profile: { willingToReview: false },
  });
  const perfEditor = await ensureUser(usersService, rbacService, {
    email: PERF_EDITOR_EMAIL,
    password: PERF_EDITOR_PASSWORD,
    displayName: 'Perf Editor',
    roleSlugs: [ROLE_SLUGS.EDITOR, ROLE_SLUGS.JOURNAL_MANAGER],
    profile: { willingToReview: false },
  });
  await ensureUser(usersService, rbacService, {
    email: PERF_MANAGER_EMAIL,
    password: PERF_MANAGER_PASSWORD,
    displayName: 'Perf Manager',
    roleSlugs: [ROLE_SLUGS.JOURNAL_MANAGER],
  });

  const authorReq = await toRequestUser(
    usersService,
    rbacService,
    perfAuthor.id,
  );
  const editorReq = await toRequestUser(
    usersService,
    rbacService,
    perfEditor.id,
  );
  const pdfBytes = Buffer.from('%PDF-1.4 perf fixture placeholder\n');

  const reviewSubmit: PerfFixturesFile['reviewSubmit'] = [];
  const emailInvites: PerfFixturesFile['emailPipeline']['invites'] = [];
  const editorQueueSlugs: string[] = [];
  const reviewerUsers: User[] = [];

  const totalReviewers = Math.max(reviewCount, emailCount);
  for (let i = 0; i < totalReviewers; i += 1) {
    const email = `reviewer-${i}@perf.local`;
    const reviewer = await ensureUser(usersService, rbacService, {
      email,
      password: PERF_REVIEWER_PASSWORD,
      displayName: `Perf Reviewer ${i}`,
      roleSlugs: [ROLE_SLUGS.REVIEWER],
      profile: { willingToReview: true },
    });
    reviewerUsers.push(reviewer);
  }

  for (let i = 0; i < reviewCount; i += 1) {
    const title = `${PERF_TITLE_PREFIX} Review submit load ${i}`;
    const created = await submissionsService.create(perfAuthor.id, {
      title,
      abstract:
        'Perf fixture submission for concurrent review-submit benchmarks. '.repeat(
          3,
        ),
      ...perfSubmissionMetadata(
        `عنوان اختبار الأداء ${i}`,
        'ملخص عربي لاختبار تقديم المراجعات المتزامنة. '.repeat(4),
        'perf, load-test, peer-review',
        'أداء, اختبار, مراجعة, مجلة, بحث, نشر',
      ),
    });
    await attachStandardFilePackage(
      submissionsService,
      created.slug!,
      authorReq,
      pdfBytes,
      `perf-review-${i}.pdf`,
    );
    await submissionsService.submit(created.slug!, authorReq);
    await promoteManuscriptsToReviewPackage(dataSource, created.id);
    const slug = created.slug!;
    const reviewer = reviewerUsers[i % reviewerUsers.length];
    const assignmentSlug = `perf-review-submit-${String(i).padStart(2, '0')}`;
    const assignment = await submissionsService.assignReviewer(
      slug,
      reviewer.id,
      editorReq,
      undefined,
      {
        assignmentSlug,
        emitReviewerInvited: false,
      },
    );
    await submissionsService.acceptReviewInvitation(
      assignment.slug!,
      reviewer.id,
    );
    reviewSubmit.push({
      reviewerEmail: reviewer.email,
      password: PERF_REVIEWER_PASSWORD,
      assignmentSlug: assignment.slug!,
    });
  }

  for (let i = 0; i < emailCount; i += 1) {
    const title = `${PERF_TITLE_PREFIX} Email pipeline load ${i}`;
    const created = await submissionsService.create(perfAuthor.id, {
      title,
      abstract:
        'Perf fixture submission for email pipeline throughput benchmarks. '.repeat(
          3,
        ),
      ...perfSubmissionMetadata(
        `عنوان اختبار البريد ${i}`,
        'ملخص عربي لاختبار خط أنابيب البريد. '.repeat(4),
        'perf, email, pipeline',
        'أداء, بريد, دعوة, مراجعة, مجلة, نشر',
      ),
    });
    await attachStandardFilePackage(
      submissionsService,
      created.slug!,
      authorReq,
      pdfBytes,
      `perf-email-${i}.pdf`,
    );
    await submissionsService.submit(created.slug!, authorReq);
    await promoteManuscriptsToReviewPackage(dataSource, created.id);
    const reviewer = reviewerUsers[i % reviewerUsers.length];
    emailInvites.push({
      submissionSlug: created.slug!,
      reviewerId: reviewer.id,
    });
  }

  const corpusTitle = `${PERF_TITLE_PREFIX} Corpus similarity load`;
  const corpusSubmission = await submissionsService.create(perfAuthor.id, {
    title: corpusTitle,
    abstract:
      'Perf fixture submission for corpus similarity job benchmarks. '.repeat(
        3,
      ),
    ...perfSubmissionMetadata(
      'عنوان اختبار تشابه المؤلفات',
      'ملخص عربي لاختبار تشابه المؤلفات. '.repeat(4),
      'perf, corpus, similarity',
      'أداء, مؤلفات, تشابه, مجلة, بحث, نشر',
    ),
  });
  await attachStandardFilePackage(
    submissionsService,
    corpusSubmission.slug!,
    authorReq,
    pdfBytes,
    'perf-corpus.pdf',
  );
  await submissionsService.submit(corpusSubmission.slug!, authorReq);

  for (let i = 0; i < queueCount; i += 1) {
    const title = `${PERF_TITLE_PREFIX} Editor queue load ${i}`;
    const created = await submissionsService.create(perfAuthor.id, {
      title,
      abstract: 'Perf fixture for editor queue list benchmarks. '.repeat(4),
      ...perfSubmissionMetadata(
        `قائمة المحرر ${i}`,
        'ملخص عربي لاختبار قائمة المحرر. '.repeat(3),
        'perf, editor, queue',
        'أداء, محرر, قائمة, مجلة, بحث, نشر',
      ),
    });
    await attachStandardFilePackage(
      submissionsService,
      created.slug!,
      authorReq,
      pdfBytes,
      `perf-queue-${i}.pdf`,
    );
    await submissionsService.submit(created.slug!, authorReq);
    await promoteManuscriptsToReviewPackage(dataSource, created.id);
    editorQueueSlugs.push(created.slug!);
  }

  const subRepo = dataSource.getRepository(Submission);
  for (let i = 0; i < publishedCount; i += 1) {
    const title = `${PERF_TITLE_PREFIX} Published catalog ${i}`;
    const created = await submissionsService.create(perfAuthor.id, {
      title,
      abstract: 'Perf fixture for public catalog search benchmarks. '.repeat(4),
      ...perfSubmissionMetadata(
        `منشور اختبار ${i}`,
        'ملخص عربي لاختبار البحث في الكتالوج. '.repeat(3),
        'perf, published, catalog',
        'أداء, منشور, كتالوج, مجلة, بحث, نشر',
      ),
    });
    await subRepo.update(created.id, {
      status: SubmissionStatus.PUBLISHED,
      publishedAt: new Date(),
    });
  }

  const uploadDraft = await submissionsService.create(perfAuthor.id, {
    title: `${PERF_TITLE_PREFIX} Upload draft`,
    abstract: 'Draft submission for file-upload perf benchmarks.',
    ...perfSubmissionMetadata(
      'مسودة رفع الملفات',
      'ملخص عربي لاختبار رفع الملفات.',
      'perf, upload',
      'أداء, رفع, ملف, مجلة',
    ),
  });

  const fixtures: PerfFixturesFile = {
    editor: { email: PERF_EDITOR_EMAIL, password: PERF_EDITOR_PASSWORD },
    manager: { email: PERF_MANAGER_EMAIL, password: PERF_MANAGER_PASSWORD },
    author: { email: PERF_AUTHOR_EMAIL, password: PERF_AUTHOR_PASSWORD },
    reviewSubmit,
    emailPipeline: { invites: emailInvites },
    corpusSimilarity: { submissionSlug: corpusSubmission.slug! },
    aiGrpcHost: (() => {
      const host = process.env.AI_SERVICE_GRPC_HOST ?? 'localhost';
      const port = process.env.AI_SERVICE_GRPC_PORT ?? '5246';
      return host.includes(':') ? host : `${host}:${port}`;
    })(),
    editorQueue: { slugs: editorQueueSlugs, count: editorQueueSlugs.length },
    publishedCatalog: { count: publishedCount },
    uploadDraft: { slug: uploadDraft.slug! },
    searchTerms: [
      'education',
      'machine',
      'research',
      'journal',
      'peer',
      'catalog',
      'perf',
    ],
  };

  const perfDir = existsSync(join(process.cwd(), '..', 'perf'))
    ? join(process.cwd(), '..', 'perf')
    : join(__dirname, '..', '..', 'perf');
  const outPath = join(perfDir, 'fixtures.json');
  if (!existsSync(perfDir)) {
    mkdirSync(perfDir, { recursive: true });
  }
  writeFileSync(outPath, JSON.stringify(fixtures, null, 2));
  console.log(
    `Perf fixtures: wrote ${outPath} (${reviewCount} review-submit, ${emailCount} email invites, ${queueCount} editor-queue, ${publishedCount} published)`,
  );
}

function clearUploadFiles(): void {
  const root = uploadRoot();
  if (!existsSync(root)) {
    return;
  }
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (name === '_tmp') {
      for (const tmpName of readdirSync(full)) {
        try {
          unlinkSync(join(full, tmpName));
        } catch {
          /* ignore */
        }
      }
      continue;
    }
    try {
      if (statSync(full).isDirectory()) {
        rmSync(full, { recursive: true, force: true });
      } else {
        unlinkSync(full);
      }
    } catch {
      /* ignore */
    }
  }
}

/**
 * Dev-only: wipe all app data (users, submissions, notifications, …).
 * RBAC catalog (roles/permissions) is kept; RbacService re-upserts on startup.
 */
async function resetAllDevData(dataSource: DataSource): Promise<void> {
  clearUploadFiles();
  await dataSource.query(`
    TRUNCATE TABLE
      copyedit_notes,
      copyedit_assignments,
      reviews,
      review_assignments,
      submission_files,
      notifications,
      outbound_event_outbox,
      role_invitations,
      revoked_tokens,
      submissions,
      user_roles,
      users,
      ai_jobs,
      auth_challenges,
      refresh_sessions,
      oauth_identities,
      article_summary_embeddings,
      article_chunk_embeddings,
      reviewer_bio_embeddings,
      journal_memberships,
      journal_issues
    RESTART IDENTITY CASCADE
  `);
  console.log(
    'SEED_RESET_ALL: truncated users, submissions, notifications, uploads, and related rows',
  );
}

async function resetSampleSubmissions(dataSource: DataSource): Promise<void> {
  const subRepo = dataSource.getRepository(Submission);
  const sampleSubs = await subRepo.find({
    where: [
      { title: Like(`${SAMPLE_TITLE_PREFIX}%`) },
      { title: Like('[DEMO]%') },
    ],
    select: ['id'],
  });
  const ids = sampleSubs.map((s) => s.id);
  if (ids.length === 0) {
    console.log(
      'SEED_RESET_SAMPLE: no [Demo] / [SAMPLE] / [DEMO] submissions to remove',
    );
    return;
  }

  const fileRepo = dataSource.getRepository(SubmissionFile);
  const files = await fileRepo.find({ where: { submissionId: In(ids) } });
  const root = uploadRoot();
  for (const f of files) {
    try {
      unlinkSync(join(root, f.storageKey));
    } catch {
      /* ignore missing files */
    }
  }

  const assignmentRepo = dataSource.getRepository(ReviewAssignment);
  const assignments = await assignmentRepo.find({
    where: { submissionId: In(ids) },
    select: ['id'],
  });
  const assignmentIds = assignments.map((a) => a.id);
  if (assignmentIds.length > 0) {
    await dataSource.getRepository(Review).delete({
      assignmentId: In(assignmentIds),
    });
  }
  await assignmentRepo.delete({ submissionId: In(ids) });

  const copyeditAssignmentRepo = dataSource.getRepository(CopyeditAssignment);
  const copyeditAssignments = await copyeditAssignmentRepo.find({
    where: { submissionId: In(ids) },
    select: ['id'],
  });
  const copyeditAssignmentIds = copyeditAssignments.map((a) => a.id);
  if (copyeditAssignmentIds.length > 0) {
    await dataSource.getRepository(CopyeditNote).delete({
      assignmentId: In(copyeditAssignmentIds),
    });
  }
  await copyeditAssignmentRepo.delete({ submissionId: In(ids) });

  await fileRepo.delete({ submissionId: In(ids) });
  await subRepo.delete(ids);
  console.log(`SEED_RESET_SAMPLE: removed ${ids.length} sample submission(s)`);
}

async function findSampleSubmission(
  dataSource: DataSource,
  authorId: string,
  title: string,
): Promise<Submission | null> {
  return dataSource.getRepository(Submission).findOne({
    where: { authorId, title },
  });
}

/** Re-seed repair: assign again when no pending invite and no active duplicate. */
async function ensureReviewerInviteForSubmission(
  dataSource: DataSource,
  submissionsService: SubmissionsService,
  submission: Submission,
  reviewerId: string,
  editorReq: RequestUser,
): Promise<boolean> {
  if (!submission.slug) return false;
  const assignmentRepo = dataSource.getRepository(ReviewAssignment);
  const invited = await assignmentRepo.findOne({
    where: {
      submissionId: submission.id,
      reviewerId,
      status: AssignmentStatus.INVITED,
    },
  });
  if (invited) return false;

  const activeDup = await assignmentRepo.findOne({
    where: {
      submissionId: submission.id,
      reviewerId,
      status: In([AssignmentStatus.INVITED, AssignmentStatus.ACCEPTED]),
    },
  });
  if (activeDup) return false;

  await submissionsService.assignReviewer(
    submission.slug,
    reviewerId,
    editorReq,
  );
  return true;
}

/** Keep dev invite sample on a fixed assignment slug; repair when submission already exists. */
async function ensureInvitePendingReviewerAssignment(
  dataSource: DataSource,
  submissionsService: SubmissionsService,
  submission: Submission,
  reviewerId: string,
  editorReq: RequestUser,
): Promise<'ok' | 'pinned' | 'assigned' | false> {
  if (!submission.slug) return false;
  const assignmentRepo = dataSource.getRepository(ReviewAssignment);

  const stable = await assignmentRepo.findOne({
    where: { slug: SAMPLE_INVITE_PENDING_ASSIGNMENT_SLUG },
  });
  if (
    stable &&
    stable.submissionId === submission.id &&
    stable.reviewerId === reviewerId &&
    stable.status === AssignmentStatus.INVITED
  ) {
    return 'ok';
  }

  const invited = await assignmentRepo.findOne({
    where: {
      submissionId: submission.id,
      reviewerId,
      status: AssignmentStatus.INVITED,
    },
  });
  if (invited) {
    if (invited.slug !== SAMPLE_INVITE_PENDING_ASSIGNMENT_SLUG) {
      const slugTaken = await assignmentRepo.exist({
        where: { slug: SAMPLE_INVITE_PENDING_ASSIGNMENT_SLUG },
      });
      if (!slugTaken) {
        invited.slug = SAMPLE_INVITE_PENDING_ASSIGNMENT_SLUG;
        await assignmentRepo.save(invited);
        return 'pinned';
      }
    }
    return 'ok';
  }

  const activeDup = await assignmentRepo.findOne({
    where: {
      submissionId: submission.id,
      reviewerId,
      status: In([AssignmentStatus.INVITED, AssignmentStatus.ACCEPTED]),
    },
  });
  if (activeDup) return false;

  await submissionsService.assignReviewer(
    submission.slug,
    reviewerId,
    editorReq,
    undefined,
    { assignmentSlug: SAMPLE_INVITE_PENDING_ASSIGNMENT_SLUG },
  );
  return 'assigned';
}

async function run() {
  // Before anything touches the database. See seed-guard.ts for why.
  assertSeedAllowed();

  const resetAll = process.env.SEED_RESET_ALL === '1';
  const resetSample =
    !resetAll &&
    (process.env.SEED_RESET_SAMPLE === '1' ||
      process.env.SEED_RESET_DEMO === '1');

  if (resetAll || resetSample) {
    console.log(`Destructive seed confirmed — target ${describeSeedTarget()}`);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const dataSource = app.get(DataSource);
  await ensurePublicationSearchSchema(dataSource);
  console.log('Publication catalog search schema ready (FTS + pg_trgm).');

  const usersService = app.get(UsersService);
  const rbacService = app.get(RbacService);
  const submissionsService = app.get(SubmissionsService);
  const aiClient = app.get(AiClientService);
  const aiEnabled = aiClient.isEnabled();

  if (resetAll) {
    await resetAllDevData(dataSource);
  } else if (resetSample) {
    await resetSampleSubmissions(dataSource);
  }

  await submissionsService.backfillSlugs();

  const author = await ensureUser(usersService, rbacService, {
    email: 'author@folio.dev',
    password: 'Author123!',
    displayName: 'A. Researcher',
    roleSlugs: [ROLE_SLUGS.AUTHOR],
    profile: {
      affiliation: 'Faculty of Information Studies, Arab Open University',
      reviewKeywords: 'methods, reproducibility',
      willingToReview: false,
    },
  });
  await ensureUser(usersService, rbacService, {
    email: 'manager@folio.local',
    password: 'Manager123!',
    displayName: 'M. Journal Manager',
    roleSlugs: [ROLE_SLUGS.JOURNAL_MANAGER],
    profile: {
      affiliation: 'Damascus University Journal — Editorial office',
    },
  });
  const editor = await ensureUser(usersService, rbacService, {
    email: 'editor@folio.dev',
    password: 'Editor123!',
    displayName: 'C. Editor',
    roleSlugs: [ROLE_SLUGS.EDITOR],
    profile: {
      affiliation: 'Damascus University Journal — Editorial office',
      reviewKeywords: null,
      willingToReview: false,
    },
  });
  const reviewer = await ensureUser(usersService, rbacService, {
    email: 'reviewer@folio.dev',
    password: 'Reviewer123!',
    displayName: 'R. Reviewer',
    roleSlugs: [ROLE_SLUGS.REVIEWER],
    profile: {
      affiliation: 'Institute for Sample Research',
      reviewKeywords:
        'open access, digital publishing, economics, arabic journals, peer review',
      willingToReview: true,
    },
  });
  const copyeditor = await ensureUser(usersService, rbacService, {
    email: 'copyeditor@folio.local',
    password: 'Copyeditor123!',
    displayName: 'P. Copyeditor',
    roleSlugs: [ROLE_SLUGS.COPYEDITOR],
    profile: {
      affiliation: 'Damascus University Journal — Editorial office',
    },
  });

  const authorReq = await toRequestUser(usersService, rbacService, author.id);
  const editorReq = await toRequestUser(usersService, rbacService, editor.id);
  const copyeditorReq = await toRequestUser(
    usersService,
    rbacService,
    copyeditor.id,
  );

  const press = await seedPressFixtures(dataSource, [
    { userId: editor.id, roleSlug: ROLE_SLUGS.EDITOR },
    { userId: reviewer.id, roleSlug: ROLE_SLUGS.REVIEWER },
    { userId: copyeditor.id, roleSlug: ROLE_SLUGS.COPYEDITOR },
  ]);

  const pdfBytes = Buffer.from('%PDF-1.4 sample manuscript placeholder\n');

  // 1) Draft + file
  const tDraft = `${SAMPLE_TITLE_PREFIX} Measuring Digital Learning Competencies Among University Students`;
  if (!(await findSampleSubmission(dataSource, author.id, tDraft))) {
    const s = await submissionsService.create(author.id, {
      title: tDraft,
      abstract:
        'This study develops and validates a scale for measuring digital learning competencies among undergraduate students and examines the effect of immediate formative feedback on academic achievement in higher-education courses.',
      ...sampleJournalMetadata(),
      ...SAMPLE_DRAFT_META,
    });
    await attachStandardFilePackage(
      submissionsService,
      s.slug!,
      authorReq,
      pdfBytes,
      'draft.pdf',
    );
    await syncSampleDiscipline(dataSource, s.id, {
      topLabel: SAMPLE_DISCIPLINE_EDUCATION,
      confidence: 76,
    });
    console.log(`Seeded: ${tDraft} (draft)`);
  }

  // 2) Submitted — stays in editor queue (no assignment)
  const tQueue = `${SAMPLE_TITLE_PREFIX} Open-Access Policies in Arabic Peer-Reviewed Journals: A Comparative Study`;
  if (!(await findSampleSubmission(dataSource, author.id, tQueue))) {
    const s = await submissionsService.create(author.id, {
      title: tQueue,
      abstract:
        'This study examines the impact of open-access and digital-publishing policies on the dissemination of knowledge in Arabic peer-reviewed journals, comparing funding models and article processing charges across ten journals over the period 2020–2024.',
      ...sampleJournalMetadata(),
      ...SAMPLE_QUEUE_META,
    });
    await attachStandardFilePackage(
      submissionsService,
      s.slug!,
      authorReq,
      pdfBytes,
      'queue.pdf',
    );
    await submissionsService.submit(s.slug!, authorReq);
    await syncSampleDiscipline(dataSource, s.id, {
      topLabel: queueSampleDisciplineLabel(),
      confidence: 91,
      confirmAsAuthor: true,
    });
    console.log(`Seeded: ${tQueue} (submitted)`);
  }

  // 3) Under review — assign reviewer
  const tReview = `${SAMPLE_TITLE_PREFIX} Digital Publishing and Open-Access Policy Frameworks in Arabic Scholarly Journals`;
  if (!(await findSampleSubmission(dataSource, author.id, tReview))) {
    const s = await submissionsService.create(author.id, {
      title: tReview,
      abstract:
        'This paper analyses open-access and digital-publishing policy frameworks adopted by Arabic scholarly journals, evaluating their effect on knowledge diffusion and comparing sustainability models across regional and international peer-reviewed outlets.',
      ...sampleJournalMetadata(),
      ...SAMPLE_REVIEW_META,
    });
    await attachStandardFilePackage(
      submissionsService,
      s.slug!,
      authorReq,
      pdfBytes,
      'under-review.pdf',
    );
    await submissionsService.submit(s.slug!, authorReq);
    await syncSampleDiscipline(dataSource, s.id, {
      topLabel: SAMPLE_DISCIPLINE_DEFAULT,
      confidence: 84,
    });
    await promoteManuscriptsToReviewPackage(dataSource, s.id);
    const reviewAssignment = await submissionsService.assignReviewer(
      s.slug!,
      reviewer.id,
      editorReq,
      undefined,
      { emitReviewerInvited: false },
    );
    await submissionsService.acceptReviewInvitation(
      reviewAssignment.slug!,
      reviewer.id,
    );
    console.log(`Seeded: ${tReview} (under_review)`);
  }

  // 4) Completed review
  const tCompleted = `${SAMPLE_TITLE_PREFIX} Personal Data Protection in Contemporary Arab Legislation`;
  if (!(await findSampleSubmission(dataSource, author.id, tCompleted))) {
    const s = await submissionsService.create(author.id, {
      title: tCompleted,
      abstract:
        'This study reviews personal-data protection provisions in selected contemporary Arab legal frameworks and compares them with the principles of the General Data Protection Regulation, focusing on data-subject consent, cross-border data transfers, and controller liability.',
      ...sampleJournalMetadata(),
      ...SAMPLE_COMPLETED_META,
    });
    await attachStandardFilePackage(
      submissionsService,
      s.slug!,
      authorReq,
      pdfBytes,
      'reviewed.pdf',
    );
    await submissionsService.submit(s.slug!, authorReq);
    await syncSampleDiscipline(dataSource, s.id, {
      topLabel: SAMPLE_DISCIPLINE_LEGAL,
      confidence: 86,
    });
    await promoteManuscriptsToReviewPackage(dataSource, s.id);
    const assignment = await submissionsService.assignReviewer(
      s.slug!,
      reviewer.id,
      editorReq,
      undefined,
      { emitReviewerInvited: false },
    );
    await submissionsService.acceptReviewInvitation(
      assignment.slug!,
      reviewer.id,
    );
    await submissionsService.submitReview(
      assignment.slug!,
      reviewer.id,
      'For the author: the legal comparison is clear; minor citation formatting updates would strengthen the policy section.',
      'Confidential to editor: suitable for acceptance after light copy-editing on references.',
      ReviewRecommendation.ACCEPT,
    );
    console.log(`Seeded: ${tCompleted} (under_review + completed assignment)`);
  }

  // 5) Revisions requested
  const tRev = `${SAMPLE_TITLE_PREFIX} The Effect of Immediate Feedback on Student Performance in Large Classes`;
  if (!(await findSampleSubmission(dataSource, author.id, tRev))) {
    const s = await submissionsService.create(author.id, {
      title: tRev,
      abstract:
        'This study experimentally evaluates an immediate-feedback programme delivered through an e-learning platform in an introductory statistics course, comparing short-test and final-project outcomes between two groups while analysing student perceptions of instructional clarity.',
      ...sampleJournalMetadata(),
      ...SAMPLE_REVISIONS_META,
    });
    await attachStandardFilePackage(
      submissionsService,
      s.slug!,
      authorReq,
      pdfBytes,
      'revisions.pdf',
    );
    await submissionsService.submit(s.slug!, authorReq);
    await syncSampleDiscipline(dataSource, s.id, {
      topLabel: SAMPLE_DISCIPLINE_EDUCATION,
      confidence: 79,
    });
    await promoteManuscriptsToReviewPackage(dataSource, s.id);
    const revAssignment = await submissionsService.assignReviewer(
      s.slug!,
      reviewer.id,
      editorReq,
      undefined,
      { emitReviewerInvited: false },
    );
    await submissionsService.acceptReviewInvitation(
      revAssignment.slug!,
      reviewer.id,
    );
    await submissionsService.submitReview(
      revAssignment.slug!,
      reviewer.id,
      'For the author: please expand the methods section and clarify Figure 2. The contribution is promising.',
      'For editor only: recommend major revisions; no concerns about ethics or overlap.',
      ReviewRecommendation.REVISIONS,
    );
    await submissionsService.updateStatus(
      s.slug!,
      editorReq,
      SubmissionStatus.REVISIONS_REQUESTED,
      undefined,
      'Please address the reviewers’ comments on methodology and expand the discussion before resubmitting.',
    );
    await submissionsService.addFile(
      s.slug!,
      authorReq,
      sampleMulterFile('revised-manuscript.pdf', pdfBytes),
      'manuscript',
    );
    await submissionsService.submit(s.slug!, authorReq);
    await syncSampleDiscipline(dataSource, s.id, {
      topLabel: SAMPLE_DISCIPLINE_DEFAULT,
      confidence: 82,
      force: true,
    });
    await promoteManuscriptsToReviewPackage(dataSource, s.id);
    await submissionsService.assignReviewer(
      s.slug!,
      reviewer.id,
      editorReq,
      undefined,
      { emitReviewerInvited: false },
    );
    console.log(
      `Seeded: ${tRev} (round1 revisions_requested → author resubmit → round2 same reviewer, invited assignment — accept on dashboard)`,
    );
  } else {
    const existingRev = await findSampleSubmission(dataSource, author.id, tRev);
    if (existingRev) {
      const repaired = await ensureReviewerInviteForSubmission(
        dataSource,
        submissionsService,
        existingRev,
        reviewer.id,
        editorReq,
      );
      if (repaired) {
        console.log(
          `Repaired: ${tRev} (new invited assignment — round-2 invite was missing or already accepted)`,
        );
      }
    }
  }

  // 5b) Reviewer invite pending — only sample that sends reviewer-invited email during seed
  const tInvitePending = `${SAMPLE_TITLE_PREFIX} Open-Access Policies in Arabic Peer-Reviewed Journals (Pending Review)`;
  const legacyInvite = await findSampleSubmission(
    dataSource,
    author.id,
    SAMPLE_INVITE_PENDING_LEGACY_TITLE,
  );
  if (legacyInvite && legacyInvite.title !== tInvitePending) {
    await dataSource.getRepository(ReviewAssignment).delete({
      submissionId: legacyInvite.id,
    });
    await dataSource.getRepository(Submission).delete(legacyInvite.id);
    console.log(
      `Removed legacy sample "${SAMPLE_INVITE_PENDING_LEGACY_TITLE}" (frees dev invite slug)`,
    );
  }
  if (!(await findSampleSubmission(dataSource, author.id, tInvitePending))) {
    const s = await submissionsService.create(author.id, {
      title: tInvitePending,
      abstract:
        'This paper investigates open-access policies in Arabic peer-reviewed journals and their influence on knowledge dissemination, drawing on a comparative documentary analysis of ten journals from 2020 to 2024.',
      ...sampleJournalMetadata(),
      ...SAMPLE_QUEUE_META,
    });
    await attachStandardFilePackage(
      submissionsService,
      s.slug!,
      authorReq,
      pdfBytes,
      'invite-pending.pdf',
    );
    await submissionsService.submit(s.slug!, authorReq);
    await syncSampleDiscipline(dataSource, s.id, {
      topLabel: SAMPLE_DISCIPLINE_DEFAULT,
      confidence: 88,
    });
    await promoteManuscriptsToReviewPackage(dataSource, s.id);
    await submissionsService.assignReviewer(
      s.slug!,
      reviewer.id,
      editorReq,
      undefined,
      { assignmentSlug: SAMPLE_INVITE_PENDING_ASSIGNMENT_SLUG },
    );
    console.log(
      `Seeded: ${tInvitePending} (reviewer invited — stable invite URL slug: ${SAMPLE_INVITE_PENDING_ASSIGNMENT_SLUG})`,
    );
  } else {
    const existingInvite = await findSampleSubmission(
      dataSource,
      author.id,
      tInvitePending,
    );
    if (existingInvite) {
      const repaired = await ensureInvitePendingReviewerAssignment(
        dataSource,
        submissionsService,
        existingInvite,
        reviewer.id,
        editorReq,
      );
      if (repaired === 'pinned' || repaired === 'assigned') {
        console.log(
          `Repaired: ${tInvitePending} (${repaired} — invite slug: ${SAMPLE_INVITE_PENDING_ASSIGNMENT_SLUG})`,
        );
      }
    }
  }

  // 6) In copyediting — accepted and assigned to copyeditor, note submitted
  const tCopyedit = `${SAMPLE_TITLE_PREFIX} Improving Wireless Sensor Network Efficiency in Industrial Environments`;
  if (!(await findSampleSubmission(dataSource, author.id, tCopyedit))) {
    const s = await submissionsService.create(author.id, {
      title: tCopyedit,
      abstract:
        'This paper proposes an energy-efficient routing protocol for wireless sensor networks deployed in industrial IoT environments, comparing response time and power consumption against reference protocols across three load scenarios.',
      ...sampleJournalMetadata(),
      ...SAMPLE_COPYEDIT_META,
    });
    await attachStandardFilePackage(
      submissionsService,
      s.slug!,
      authorReq,
      pdfBytes,
      'copyedit.pdf',
    );
    await submissionsService.submit(s.slug!, authorReq);
    await syncSampleDiscipline(dataSource, s.id, {
      topLabel: SAMPLE_DISCIPLINE_ENGINEERING,
      confidence: 87,
    });
    await submissionsService.updateStatus(
      s.slug!,
      editorReq,
      SubmissionStatus.ACCEPTED,
    );
    const ceAssignment = await submissionsService.assignCopyeditor(
      s.slug!,
      copyeditor.id,
      editorReq,
    );
    await submissionsService.submitCopyeditNote(
      ceAssignment.slug!,
      copyeditor.id,
      'Minor style edits applied to technical terms in the abstract. Please confirm the routing-protocol naming is consistent.',
      'No structural concerns; ready to publish once author acknowledges.',
    );
    console.log(`Seeded: ${tCopyedit} (copyediting, note submitted)`);
  }

  // 7–9) Published catalog — pub + pub2 share topic/keywords for high embedding similarity
  const tPub = `${SAMPLE_TITLE_PREFIX} Digital Publishing Policies and Knowledge Economics in Arabic Journals`;
  const tPub2 = `${SAMPLE_TITLE_PREFIX} Open-Access Policies and Knowledge Economics in Arabic Peer-Reviewed Journals`;
  const tPub3 = `${SAMPLE_TITLE_PREFIX} Research Ethics in Small-Sample Clinical Studies`;

  const skipPublishedForPerf = process.env.SEED_PERF_FIXTURES === '1';

  if (!skipPublishedForPerf)
    await seedPublishedSample({
      dataSource,
      submissionsService,
      author,
      authorReq,
      editorReq,
      copyeditor,
      copyeditorReq,
      pdfBytes,
      title: tPub,
      abstract:
        'This study examines the impact of digital publishing policies on knowledge economics in Arabic journals, comparing open-access funding models and article processing charges across peer-reviewed Arabic and international outlets from 2020 to 2024.',
      publicationMeta: SAMPLE_PUB1_META,
      manuscriptFilename: 'published.pdf',
      revisionFilename: 'published-revision.pdf',
      discipline: { topLabel: SAMPLE_DISCIPLINE_DEFAULT, confidence: 90 },
      logLabel: 'published',
    });

  if (!skipPublishedForPerf)
    await seedPublishedSample({
      dataSource,
      submissionsService,
      author,
      authorReq,
      editorReq,
      copyeditor,
      copyeditorReq,
      pdfBytes,
      title: tPub2,
      abstract:
        'This study analyses open-access policies and their effect on knowledge economics in Arabic peer-reviewed journals, applying documentary analysis to publishing policies of ten journals over 2020–2024, with recommendations for expanding access without compromising the sustainability of academic publishing.',
      publicationMeta: SAMPLE_PUB2_META,
      manuscriptFilename: 'published-peer.pdf',
      revisionFilename: 'published-peer-revision.pdf',
      discipline: { topLabel: SAMPLE_DISCIPLINE_DEFAULT, confidence: 88 },
      logLabel: 'published, related-articles peer',
    });

  if (!skipPublishedForPerf)
    await seedPublishedSample({
      dataSource,
      submissionsService,
      author,
      authorReq,
      editorReq,
      copyeditor,
      copyeditorReq,
      pdfBytes,
      title: tPub3,
      abstract:
        'This case report discusses the challenges of informed consent and confidentiality in small-sample clinical studies, with a focus on teaching-hospital contexts and practical recommendations for institutional ethics review boards when statistical power is limited.',
      publicationMeta: SAMPLE_PUB3_META,
      manuscriptFilename: 'published-medical.pdf',
      revisionFilename: 'published-medical-revision.pdf',
      discipline: {
        topLabel: SAMPLE_DISCIPLINE_MEDICAL,
        confidence: 85,
        suggestedLabels: [SAMPLE_DISCIPLINE_MEDICAL, 'العلوم الأساسية'],
        disciplines: [SAMPLE_DISCIPLINE_MEDICAL, 'العلوم الأساسية'],
      },
      logLabel: 'published, related-articles distant peer',
    });

  const placement = await placeDemoSubmissions(
    dataSource,
    press.journalsBySlug,
    press.publishedIssueByJournalId,
  );

  if (!skipPublishedForPerf && aiClient.isSimilarityEnabled()) {
    const indexJobs =
      await submissionsService.enqueueMissingSimilarityIndexJobs();
    console.log(
      `Enqueued ${indexJobs} similarity index job(s) for published [Demo] articles (processed async via RabbitMQ).`,
    );
  }

  console.log('\n--- Sample accounts (change passwords in production) ---');
  console.log('author@folio.dev            / Author123!      roles: author');
  console.log(
    'manager@folio.local         / Manager123!     roles: journal_manager',
  );
  console.log('editor@folio.dev            / Editor123!      roles: editor');
  console.log('reviewer@folio.dev          / Reviewer123!    roles: reviewer');
  console.log(
    'copyeditor@folio.local      / Copyeditor123!  roles: copyeditor',
  );
  console.log(
    '\n--- Journals (catalog rows from migration; seed looks up by slug) ---',
  );
  console.log(
    `${press.journalsBySlug.size} journals × 3 issues (published 2025/2, published 2026/1, open 2026/2)`,
  );
  console.log(
    `Staff memberships: editor/reviewer/copyeditor on every journal (${press.membershipsCreated} new). journal_manager stays global.`,
  );
  console.log(
    `Placed ${placement.placed} demo submission(s) onto journals (${placement.publishedPlaced} into العدد 1، 2026).`,
  );
  console.log('\n--- Demo submissions (title prefix [Demo]) ---');
  console.log(`${tDraft} — author: draft with file`);
  console.log(`${tQueue} — editor queue: submitted`);
  console.log(
    `${tInvitePending} — reviewer invite pending (reviewer-invited email + /assignments/.../invite)`,
  );
  console.log(`${tReview} — editor/reviewer: under review`);
  console.log(`${tCompleted} — reviewer: assignment completed`);
  console.log(
    `${tRev} — round1: revisions requested; author resubmitted + revised file; round2: same reviewer, invitation pending (accept in app)`,
  );
  console.log(`${tCopyedit} — copyediting: assigned + note submitted`);
  console.log(`${tPub} — public catalog: published (open-access policy)`);
  console.log(
    `${tPub2} — public catalog: published (near-duplicate of ${tPub} for similarity)`,
  );
  console.log(
    `${tPub3} — public catalog: published (medical ethics, distant peer)`,
  );
  console.log('\n--- Demo paths by role ---');
  console.log(
    `Author (${author.email}): ${tDraft} — edit metadata, files, optional AI suggest; ${tRev} — resubmit flow`,
  );
  console.log(
    `Editor (${editor.email}): ${tQueue} — queue + assign reviewer; ${tCompleted} — read finished review; ${tRev} — revisions decision`,
  );
  console.log(
    `Reviewer (${reviewer.email} / Reviewer123!): ${tInvitePending} — invited (email accept link works); ${tReview} — active review; ${tRev} — round-2 invite if still pending`,
  );
  console.log(
    `Reviewer-invited email: log in as ${reviewer.email} (not author/editor). After seed:fresh, the TOP inbox message should be "Review invitation: ${tInvitePending}" — or visit /en/assignments/${SAMPLE_INVITE_PENDING_ASSIGNMENT_SLUG}/invite`,
  );
  console.log(
    `Copyeditor (${copyeditor.email}): ${tCopyedit} — notes; published rows show full accept→publish path`,
  );
  console.log(
    'Public catalog: search "open access", "metadata", or Arabic terms from published abstracts (keyword FTS)',
  );
  console.log(
    `Email pipeline scripts: similarity title contains keywords from "${tQueue}" or "${tInvitePending}"`,
  );
  console.log(
    '\n--- AI features (optional; enable flags in backend + ai-service .env) ---',
  );
  if (aiEnabled) {
    console.log(
      'Discipline: submit() classifies from Arabic abstract; fallbacks apply only when classification did not persist.',
    );
  } else {
    console.log(
      'Discipline: seeded disciplineSuggested on each sample (no ai-service). Enable AI_SERVICE_ENABLED + gRPC, then npm run seed:reset.',
    );
  }
  console.log(
    `Keywords suggest: author draft ${tDraft} (AI_KEYWORDS_ENABLED + OpenAI on ai-service)`,
  );
  console.log(
    `Corpus similarity: editor/reviewer on ${tQueue} or ${tReview} (AI_SIMILARITY_ENABLED; overlaps ${tPub})`,
  );
  console.log(
    `Suggested reviewers: editor on ${tQueue} or ${tReview} (AI_REVIEWER_MATCHING_ENABLED)`,
  );
  console.log(
    `Related articles: open ${tPub} or ${tPub2} — expect the other with high similarity; ${tPub3} stays distant`,
  );
  console.log(
    'Semantic catalog: searchMode=semantic with q e.g. وصول مفتوح or نشر رقمي مجلات عربية',
  );
  console.log(
    'JOURNAL_ALLOWED_DISCIPLINES (pipe-separated Arabic labels): out-of-scope badge on queue sample when medical label is outside scope.',
  );
  console.log(
    'After changing published Arabic text: npm run seed:reset (re-indexes similarity corpus).',
  );
  console.log('\nRe-run safely. Dev reset options:');
  console.log(
    '  SEED_RESET_ALL=1       — truncate all users/submissions/uploads, then re-seed (npm run seed:fresh)',
  );
  console.log(
    '  SEED_RESET_SAMPLE=1    — remove only [Demo] / [SAMPLE] / [DEMO] submissions, then re-seed (npm run seed:reset)',
  );

  if (process.env.SEED_PERF_FIXTURES === '1') {
    await seedPerfFixtures({
      dataSource,
      usersService,
      rbacService,
      submissionsService,
    });
    console.log(
      '  SEED_PERF_FIXTURES=1   — perf/fixtures.json written (npm run seed:perf)',
    );
  }

  await app.close();
}

run().catch((e) => {
  // A refused seed is an operator mistake, not a crash — print the reason
  // rather than a stack trace nobody reads.
  if (e instanceof SeedNotAllowedError) {
    console.error(`\n${e.message}\n`);
    process.exit(1);
  }
  console.error(e);
  process.exit(1);
});
