import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { DataSource, In, Like } from 'typeorm';
import { minimalPdf } from '../common/minimal-pdf';
import { ReviewAssignment } from '../entities/review-assignment.entity';
import { Review } from '../entities/review.entity';
import { SubmissionFile } from '../entities/submission-file.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { Submission } from '../entities/submission.entity';
import type { User } from '../entities/user.entity';
import type { CreateSubmissionDto } from '../submissions/dto/create-submission.dto';
import type { SeededPress } from '../journals/seed-journals';
import { ROLE_SLUGS } from '../rbac/permission-slugs';
import { ensureUser, toRequestUser } from './accounts';
import type { SeedContext } from './context';
import { sampleJournalMetadata, seedJournalId } from './sample-content';
import {
  attachStandardFilePackage,
  promoteManuscriptsToReviewPackage,
} from './sample-files';

const PERF_TITLE_PREFIX = '[Perf]';

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

function perfSubmissionMetadata(
  journalId: string,
  titleAr: string,
  abstractAr: string,
  keywords: string,
  keywordsAr: string,
): Omit<CreateSubmissionDto, 'title' | 'abstract'> {
  return {
    ...sampleJournalMetadata(journalId),
    titleAr,
    abstractAr,
    keywords,
    keywordsAr,
  };
}

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

export async function seedPerfFixtures(options: {
  ctx: SeedContext;
  press: SeededPress;
}): Promise<void> {
  const {
    ctx: { dataSource, usersService, rbacService, submissionsService },
    press,
  } = options;
  await resetPerfSubmissions(dataSource);
  // Load-test rows are not about topic; the catch-all journal keeps them out
  // of the editorial journals a demo actually walks through.
  const perfJournalId = seedJournalId(press, null);
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
  const pdfBytes = minimalPdf('Perf fixture manuscript');

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
        perfJournalId,
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
        perfJournalId,
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
      perfJournalId,
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
        perfJournalId,
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
        perfJournalId,
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
      perfJournalId,
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

  // npm scripts run with cwd = backend/, so ../perf is the repo perf dir.
  // The fallback is three levels up because this file lives in src/seed/.
  const perfDir = existsSync(join(process.cwd(), '..', 'perf'))
    ? join(process.cwd(), '..', 'perf')
    : join(__dirname, '..', '..', '..', 'perf');
  const outPath = join(perfDir, 'fixtures.json');
  if (!existsSync(perfDir)) {
    mkdirSync(perfDir, { recursive: true });
  }
  writeFileSync(outPath, JSON.stringify(fixtures, null, 2));
  console.log(
    `Perf fixtures: wrote ${outPath} (${reviewCount} review-submit, ${emailCount} email invites, ${queueCount} editor-queue, ${publishedCount} published)`,
  );
}
