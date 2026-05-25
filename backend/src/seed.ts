import 'reflect-metadata';
import { config } from 'dotenv';
import { randomUUID } from 'crypto';
import { extname, join } from 'path';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
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

config({ path: join(__dirname, '..', '.env') });

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
  const resetSample =
    process.env.SEED_RESET_SAMPLE === '1' ||
    process.env.SEED_RESET_DEMO === '1';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const dataSource = app.get(DataSource);
  const usersService = app.get(UsersService);
  const rbacService = app.get(RbacService);
  const submissionsService = app.get(SubmissionsService);

  if (resetSample) {
    await resetSampleSubmissions(dataSource);
  }

  await submissionsService.backfillSlugs();

  const author = await ensureUser(usersService, rbacService, {
    email: 'author@folio.local',
    password: 'Author123!',
    displayName: 'A. Researcher',
    roleSlugs: [ROLE_SLUGS.AUTHOR],
    profile: {
      affiliation: 'Department of Example Studies, State University',
      reviewKeywords: 'methods, reproducibility',
      willingToReview: false,
    },
  });
  const editor = await ensureUser(usersService, rbacService, {
    email: 'editor@folio.local',
    password: 'Editor123!',
    displayName: 'C. Editor',
    roleSlugs: [ROLE_SLUGS.AUTHOR, ROLE_SLUGS.EDITOR, ROLE_SLUGS.REVIEWER],
    profile: {
      affiliation: 'Folio Journal — Editorial office',
      reviewKeywords: 'editorial',
      willingToReview: true,
    },
  });
  const reviewer = await ensureUser(usersService, rbacService, {
    email: 'reviewer@folio.local',
    password: 'Reviewer123!',
    displayName: 'R. Reviewer',
    roleSlugs: [ROLE_SLUGS.AUTHOR, ROLE_SLUGS.REVIEWER],
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

  // 7) Published — goes through the full copyediting stage
  const tPub = `${SAMPLE_TITLE_PREFIX} Published article`;
  if (!(await findSampleSubmission(dataSource, author.id, tPub))) {
    const s = await submissionsService.create(author.id, {
      title: tPub,
      abstract: 'Sample publication visible on the public catalog.',
      ...sampleJournalMetadata(),
    });
    await attachStandardFilePackage(
      submissionsService,
      s.slug!,
      authorReq,
      pdfBytes,
      'published.pdf',
    );
    await submissionsService.submit(s.slug!, authorReq);
    await submissionsService.updateStatus(
      s.slug!,
      editorReq,
      SubmissionStatus.ACCEPTED,
    );
    const pubCeAssignment = await submissionsService.assignCopyeditor(
      s.slug!,
      copyeditor.id,
      editorReq,
    );
    await submissionsService.submitCopyeditNote(
      pubCeAssignment.slug!,
      copyeditor.id,
      'Proofread and formatted. Please upload the final file if needed.',
      '',
    );
    await submissionsService.addFile(
      s.slug!,
      authorReq,
      sampleMulterFile('published-revision.pdf', pdfBytes),
      'manuscript',
    );
    await submissionsService.markCopyeditAuthorReady(
      pubCeAssignment.slug!,
      author.id,
    );
    await submissionsService.publishSubmission(s.slug!, copyeditorReq);
    console.log(`Seeded: ${tPub} (published)`);
  }

  console.log('\n--- Sample accounts (change passwords in production) ---');
  console.log('author@folio.local      / Author123!      roles: author');
  console.log('editor@folio.local      / Editor123!      roles: author, editor, reviewer');
  console.log('reviewer@folio.local    / Reviewer123!    roles: author, reviewer');
  console.log('copyeditor@folio.local  / Copyeditor123!  roles: copyeditor');
  console.log('\n--- Sample submissions (title prefix [SAMPLE]) ---');
  console.log(`${tDraft} — author: draft with file`);
  console.log(`${tQueue} — editor queue: submitted`);
  console.log(`${tReview} — editor/reviewer: under review`);
  console.log(`${tCompleted} — reviewer: assignment completed`);
  console.log(
    `${tRev} — round1: revisions requested; author resubmitted + revised file; round2: same reviewer, invitation pending (accept in app)`,
  );
  console.log(`${tCopyedit} — copyediting: assigned + note submitted`);
  console.log(`${tPub} — public catalog: published`);
  console.log(
    '\nRe-run safely; use SEED_RESET_SAMPLE=1 (or legacy SEED_RESET_DEMO=1) to wipe [SAMPLE] and legacy [DEMO] submissions first.',
  );

  await app.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
