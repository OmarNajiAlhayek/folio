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
import { ReviewAssignment } from './entities/review-assignment.entity';
import { Review, ReviewRecommendation } from './entities/review.entity';
import { CopyeditAssignment } from './entities/copyedit-assignment.entity';
import { CopyeditNote } from './entities/copyedit-note.entity';
import { SubmissionStatus } from './entities/submission-status.enum';
import { SubmissionArticleType } from './entities/submission-article-type.enum';
import { SubmissionFileStage } from './entities/submission-file-stage.enum';
import type { User } from './entities/user.entity';
import type { CreateSubmissionDto } from './submissions/dto/create-submission.dto';
import { AiClientService } from './ai/ai-client.service';
import { SubmissionDisciplineSource } from './entities/submission-discipline-source.enum';
import type { DisciplineClassificationJson } from './ai/ai-client.types';
import { parseJournalAllowedDisciplines } from './ai/discipline-labels';
import { ensurePublicationSearchSchema } from './common/ensure-publication-search-schema';

config({ path: join(__dirname, '..', '.env') });

/** Default AraBERT-style label for dev samples when ai-service is off or unreachable. */
const SAMPLE_DISCIPLINE_DEFAULT = 'العلوم الاقتصادية والسياسية';
const SAMPLE_DISCIPLINE_MEDICAL = 'العلوم الطبية';

const SAMPLE_TITLE_PREFIX = '[SAMPLE]';

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

const SAMPLE_ABSTRACT_AR =
  'ملخص عربي نموذجي للمجلة. يوضح هدف البحث والأساليب والنتائج الرئيسية لأغراض العرض في بيئة التطوير.';

const SAMPLE_TITLE_AR =
  'عنوان عربي نموذجي يطابق المخطوطة للعرض في بيئة التطوير';

/** Arabic + keyword bundles for published-catalog samples (distinct embeddings). */
const SAMPLE_PUB1_META = {
  titleAr: 'سياسات النشر الرقمي والاقتصاد المعرفي في المجلات العربية',
  abstractAr:
    'يستعرض هذا البحث أثر سياسات الوصول المفتوح على انتشار المعرفة الاقتصادية، ويقارن نماذج تمويل النشر بين المجلات المحكّمة العربية والدولية. تُستخدم منهجية تحليل وثائقي لعينة من سياسات النشر لدى عشر مجلات خلال 2020–2024.',
  keywords:
    'open access, digital publishing, economics, arabic journals, policy',
  keywordsAr: 'وصول مفتوح, نشر رقمي, اقتصاد, مجلات عربية, سياسات',
} as const;

const SAMPLE_PUB2_META = {
  articleType: SubmissionArticleType.REVIEW_ARTICLE,
  titleAr: 'فهرسة المجلات العلمية العربية وبيانات التعريف للقراء',
  abstractAr:
    'تبحث الدراسة في معايير فهرسة المقالات المنشورة وبيانات التعريف (العنوان، الملخص، الكلمات المفتاحية) لتحسين اكتشاف المحتوى في الفهارس العامة. تُقترح إطار عمل لتوحيد حقول الميتاداتا بين الناشرين العرب دون التضحية بالتنوع اللغوي.',
  keywords: 'metadata, catalog, DOI, discovery, arabic scholarly publishing',
  keywordsAr: 'بيانات تعريف, فهرسة, اكتشاف, نشر علمي عربي, مجلات',
} as const;

const SAMPLE_PUB3_META = {
  articleType: SubmissionArticleType.CASE_REPORT,
  titleAr: 'أخلاقيات البحوث السريرية ذات العينات الصغيرة',
  abstractAr:
    'يناقش المقال تحديات الموافقة المستنيرة والسرية في الدراسات السريرية محدودة العينة، مع التركيز على سياقات المستشفيات التعليمية. يقدّم الباحثون توصيات عملية لمراجعات الأخلاقيات المؤسسية عند ضعف القدرة الإحصائية.',
  keywords: 'clinical research, research ethics, small samples, IRB',
  keywordsAr: 'بحوث سريرية, أخلاقيات, عينات صغيرة, لجان أخلاقيات',
} as const;

type SamplePublicationMetaOverrides = Pick<
  CreateSubmissionDto,
  'titleAr' | 'abstractAr' | 'keywords' | 'keywordsAr'
>;

/** Journal form fields for a published sample; overrides generic Arabic boilerplate. */
function samplePublicationMetadata(
  overrides: SamplePublicationMetaOverrides,
): Omit<CreateSubmissionDto, 'title' | 'abstract'> {
  return { ...sampleJournalMetadata(), ...overrides };
}

/** Rich metadata matching journal-style submission forms (sample data). */
function sampleJournalMetadata(): Omit<
  CreateSubmissionDto,
  'title' | 'abstract'
> {
  return {
    titleAr: SAMPLE_TITLE_AR,
    abstractAr: SAMPLE_ABSTRACT_AR,
    articleType: SubmissionArticleType.ORIGINAL_RESEARCH,
    keywords: 'sample, methods, research, workflow, science',
    keywordsAr: 'عينة, منهجيات, بحث, سير العمل, علوم',
    contributors: [
      {
        fullName: 'A. Researcher',
        email: 'author@folio.local',
        affiliation: 'Department of Example Studies, State University',
        sortOrder: 0,
        isCorresponding: true,
      },
    ],
    fundingStatement:
      'Supported by Example Grant G-2024-001 (illustrative sample only).',
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
 * Skips when submit() already stored AI output (AI_SERVICE_ENABLED + ai-service up).
 */
async function syncSampleDiscipline(
  dataSource: DataSource,
  submissionId: string,
  options: {
    topLabel?: string;
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
  if (row.disciplineSuggested?.trim() && !options.force) {
    return;
  }

  const topLabel = options.topLabel ?? SAMPLE_DISCIPLINE_DEFAULT;
  const confidence = options.confidence ?? 88.5;
  const allowed = parseJournalAllowedDisciplines(
    process.env.JOURNAL_ALLOWED_DISCIPLINES,
  );
  const scopeInJournal =
    allowed.length === 0 ? true : allowed.includes(topLabel);

  row.disciplineSuggested = topLabel;
  row.disciplineSuggestedConfidence = confidence.toFixed(2);
  row.disciplineClassification = sampleDisciplineClassification(
    topLabel,
    confidence,
    scopeInJournal,
  );
  if (options.confirmAsAuthor) {
    row.discipline = topLabel;
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
  await dataSource.getRepository(SubmissionFile).update(
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
  publicationMeta: SamplePublicationMetaOverrides;
  manuscriptFilename: string;
  revisionFilename: string;
  discipline: { topLabel: string; confidence: number };
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

  if (await findSampleSubmission(dataSource, author.id, title)) {
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
  await submissionsService.addFile(
    s.slug!,
    authorReq,
    sampleMulterFile(revisionFilename, pdfBytes),
    'manuscript',
  );
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
  await rbacService.assignRoles(user.id, def.roleSlugs);
  return user;
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
      users
    RESTART IDENTITY
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
      'SEED_RESET_SAMPLE: no [SAMPLE] or legacy [DEMO] submissions to remove',
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

async function run() {
  const resetAll = process.env.SEED_RESET_ALL === '1';
  const resetSample =
    !resetAll &&
    (process.env.SEED_RESET_SAMPLE === '1' ||
      process.env.SEED_RESET_DEMO === '1');
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
    email: 'o65834757@gmail.com',
    password: 'Author123!',
    displayName: 'A. Researcher',
    roleSlugs: [ROLE_SLUGS.AUTHOR],
    profile: {
      affiliation: 'Department of Example Studies, State University',
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
      affiliation: 'Folio Journal — Editorial office',
    },
  });
  const editor = await ensureUser(usersService, rbacService, {
    email: 'k76462338@gmail.com',
    password: 'Editor123!',
    displayName: 'C. Editor',
    roleSlugs: [ROLE_SLUGS.EDITOR, ROLE_SLUGS.REVIEWER],
    profile: {
      affiliation: 'Folio Journal — Editorial office',
      reviewKeywords: 'editorial',
      willingToReview: true,
    },
  });
  const reviewer = await ensureUser(usersService, rbacService, {
    email: 'ysryrwthqsdthwy@gmail.com',
    password: 'Reviewer123!',
    displayName: 'R. Reviewer',
    roleSlugs: [ROLE_SLUGS.REVIEWER],
    profile: {
      affiliation: 'Institute for Sample Research',
      reviewKeywords: 'peer review, methodology',
      willingToReview: true,
    },
  });
  const copyeditor = await ensureUser(usersService, rbacService, {
    email: 'copyeditor@folio.local',
    password: 'Copyeditor123!',
    displayName: 'P. Copyeditor',
    roleSlugs: [ROLE_SLUGS.COPYEDITOR],
    profile: {
      affiliation: 'Folio Journal — Editorial office',
    },
  });

  const authorReq = await toRequestUser(usersService, rbacService, author.id);
  const editorReq = await toRequestUser(usersService, rbacService, editor.id);
  const copyeditorReq = await toRequestUser(usersService, rbacService, copyeditor.id);

  const pdfBytes = Buffer.from('%PDF-1.4 sample manuscript placeholder\n');

  // 1) Draft + file
  const tDraft = `${SAMPLE_TITLE_PREFIX} Draft manuscript`;
  if (!(await findSampleSubmission(dataSource, author.id, tDraft))) {
    const s = await submissionsService.create(author.id, {
      title: tDraft,
      abstract: 'Sample draft for the author workspace.',
      ...sampleJournalMetadata(),
    });
    await attachStandardFilePackage(
      submissionsService,
      s.slug!,
      authorReq,
      pdfBytes,
      'draft.pdf',
    );
    await syncSampleDiscipline(dataSource, s.id, {
      topLabel: SAMPLE_DISCIPLINE_DEFAULT,
      confidence: 76,
    });
    console.log(`Seeded: ${tDraft} (draft)`);
  }

  // 2) Submitted — stays in editor queue (no assignment)
  const tQueue = `${SAMPLE_TITLE_PREFIX} In editor queue`;
  if (!(await findSampleSubmission(dataSource, author.id, tQueue))) {
    const s = await submissionsService.create(author.id, {
      title: tQueue,
      abstract: 'Sample manuscript waiting in the editor queue.',
      ...sampleJournalMetadata(),
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
  const tReview = `${SAMPLE_TITLE_PREFIX} Under review`;
  if (!(await findSampleSubmission(dataSource, author.id, tReview))) {
    const s = await submissionsService.create(author.id, {
      title: tReview,
      abstract: 'Sample manuscript assigned to a reviewer.',
      ...sampleJournalMetadata(),
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
    );
    await submissionsService.acceptReviewInvitation(
      reviewAssignment.slug!,
      reviewer.id,
    );
    console.log(`Seeded: ${tReview} (under_review)`);
  }

  // 4) Completed review
  const tCompleted = `${SAMPLE_TITLE_PREFIX} With completed review`;
  if (!(await findSampleSubmission(dataSource, author.id, tCompleted))) {
    const s = await submissionsService.create(author.id, {
      title: tCompleted,
      abstract: 'Sample manuscript with one finished review.',
      ...sampleJournalMetadata(),
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
      topLabel: 'العلوم القانونية',
      confidence: 86,
    });
    await promoteManuscriptsToReviewPackage(dataSource, s.id);
    const assignment = await submissionsService.assignReviewer(
      s.slug!,
      reviewer.id,
      editorReq,
    );
    await submissionsService.acceptReviewInvitation(
      assignment.slug!,
      reviewer.id,
    );
    await submissionsService.submitReview(
      assignment.slug!,
      reviewer.id,
      'For the author: solid work with minor revision suggestions.',
      'Confidential to editor: suitable for acceptance after light copy-editing.',
      ReviewRecommendation.ACCEPT,
    );
    console.log(`Seeded: ${tCompleted} (under_review + completed assignment)`);
  }

  // 5) Revisions requested
  const tRev = `${SAMPLE_TITLE_PREFIX} Revisions requested`;
  if (!(await findSampleSubmission(dataSource, author.id, tRev))) {
    const s = await submissionsService.create(author.id, {
      title: tRev,
      abstract: 'Sample manuscript awaiting author revisions.',
      ...sampleJournalMetadata(),
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
      topLabel: 'العلوم التربوية والنفسية',
      confidence: 79,
    });
    await promoteManuscriptsToReviewPackage(dataSource, s.id);
    const revAssignment = await submissionsService.assignReviewer(
      s.slug!,
      reviewer.id,
      editorReq,
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
    await submissionsService.assignReviewer(s.slug!, reviewer.id, editorReq);
    console.log(
      `Seeded: ${tRev} (round1 revisions_requested → author resubmit → round2 same reviewer, invited assignment — accept on dashboard)`,
    );
  }

  // 6) In copyediting — accepted and assigned to copyeditor, note submitted
  const tCopyedit = `${SAMPLE_TITLE_PREFIX} In copyediting`;
  if (!(await findSampleSubmission(dataSource, author.id, tCopyedit))) {
    const s = await submissionsService.create(author.id, {
      title: tCopyedit,
      abstract: 'Sample manuscript assigned to a copyeditor for final polish.',
      ...sampleJournalMetadata(),
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
      topLabel: 'العلوم الهندسية',
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
      'Minor style edits applied. Please review the revised abstract phrasing.',
      'No structural concerns; ready to publish once author acknowledges.',
    );
    console.log(`Seeded: ${tCopyedit} (copyediting, note submitted)`);
  }

  // 7–9) Published catalog samples — distinct Arabic text for similarity / related articles
  const tPub = `${SAMPLE_TITLE_PREFIX} Published article`;
  const tPub2 = `${SAMPLE_TITLE_PREFIX} Related publication peer`;
  const tPub3 = `${SAMPLE_TITLE_PREFIX} Published medical ethics`;

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
      'Sample publication on open-access policy and knowledge economics (public catalog).',
    publicationMeta: SAMPLE_PUB1_META,
    manuscriptFilename: 'published.pdf',
    revisionFilename: 'published-revision.pdf',
    discipline: { topLabel: SAMPLE_DISCIPLINE_DEFAULT, confidence: 90 },
    logLabel: 'published',
  });

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
      'Sample publication on journal metadata and catalog discovery (related-articles peer).',
    publicationMeta: SAMPLE_PUB2_META,
    manuscriptFilename: 'published-peer.pdf',
    revisionFilename: 'published-peer-revision.pdf',
    discipline: { topLabel: SAMPLE_DISCIPLINE_DEFAULT, confidence: 88 },
    logLabel: 'published, related-articles peer',
  });

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
      'Sample publication on clinical-research ethics with small cohorts (distant related topic).',
    publicationMeta: SAMPLE_PUB3_META,
    manuscriptFilename: 'published-medical.pdf',
    revisionFilename: 'published-medical-revision.pdf',
    discipline: { topLabel: SAMPLE_DISCIPLINE_MEDICAL, confidence: 85 },
    logLabel: 'published, related-articles distant peer',
  });

  console.log('\n--- Sample accounts (change passwords in production) ---');
  console.log('o65834757@gmail.com         / Author123!      roles: author');
  console.log('manager@folio.local         / Manager123!     roles: journal_manager');
  console.log('k76462338@gmail.com         / Editor123!      roles: editor, reviewer');
  console.log('ysryrwthqsdthwy@gmail.com   / Reviewer123!    roles: reviewer');
  console.log('copyeditor@folio.local      / Copyeditor123!  roles: copyeditor');
  console.log('\n--- Sample submissions (title prefix [SAMPLE]) ---');
  console.log(`${tDraft} — author: draft with file`);
  console.log(`${tQueue} — editor queue: submitted`);
  console.log(`${tReview} — editor/reviewer: under review`);
  console.log(`${tCompleted} — reviewer: assignment completed`);
  console.log(
    `${tRev} — round1: revisions requested; author resubmitted + revised file; round2: same reviewer, invitation pending (accept in app)`,
  );
  console.log(`${tCopyedit} — copyediting: assigned + note submitted`);
  console.log(`${tPub} — public catalog: published (open-access policy)`);
  console.log(`${tPub2} — public catalog: published (metadata / catalog peer)`);
  console.log(`${tPub3} — public catalog: published (medical ethics, distant peer)`);
  console.log(
    'Related articles: use SEED_RESET_SAMPLE=1 (npm run seed:reset) after changing published samples so Arabic abstracts re-index in ai-service.',
  );
  console.log('\n--- Academic field (AraBERT) ---');
  if (aiEnabled) {
    console.log(
      'AI_SERVICE_ENABLED: submit() calls ai-service; samples also get fallback labels only when classification did not persist.',
    );
  } else {
    console.log(
      'AI_SERVICE_ENABLED=false: seeded disciplineSuggested/discipline on samples for editor/author UI (no ai-service required).',
    );
    console.log(
      'To use live classification: set AI_SERVICE_ENABLED=true, AI_SERVICE_GRPC_HOST=127.0.0.1, run ai-service (HTTP :5245 probes + gRPC :5246), then npm run seed:reset',
    );
  }
  console.log(
    'Optional JOURNAL_ALLOWED_DISCIPLINES (pipe-separated Arabic labels) marks out-of-scope suggestions in the editor queue sample.',
  );
  console.log(
    '\nRe-run safely. Dev reset options:',
  );
  console.log(
    '  SEED_RESET_ALL=1       — truncate all users/submissions/uploads, then re-seed (npm run seed:fresh)',
  );
  console.log(
    '  SEED_RESET_SAMPLE=1    — remove only [SAMPLE] / [DEMO] submissions, then re-seed (npm run seed:reset)',
  );

  await app.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
