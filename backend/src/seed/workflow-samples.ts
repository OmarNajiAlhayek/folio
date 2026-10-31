import { DataSource, In } from 'typeorm';
import { minimalPdf } from '../common/minimal-pdf';
import type { RequestUser } from '../common/types/request-user';
import {
  AssignmentStatus,
  ReviewAssignment,
} from '../entities/review-assignment.entity';
import { ReviewRecommendation } from '../entities/review.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { Submission } from '../entities/submission.entity';
import type { User } from '../entities/user.entity';
import type { SeededPress } from '../journals/seed-journals';
import type { SeedEditorRequests } from './accounts';
import type { SeedContext } from './context';
import {
  queueSampleDisciplineLabel,
  syncSampleDiscipline,
} from './sample-discipline';
import {
  SAMPLE_COMPLETED_META,
  SAMPLE_COMPLETED_TITLE,
  SAMPLE_COPYEDIT_META,
  SAMPLE_COPYEDIT_TITLE,
  SAMPLE_DISCIPLINE_DEFAULT,
  SAMPLE_DISCIPLINE_EDUCATION,
  SAMPLE_DISCIPLINE_ENGINEERING,
  SAMPLE_DISCIPLINE_LEGAL,
  SAMPLE_DRAFT_META,
  SAMPLE_DRAFT_TITLE,
  SAMPLE_INVITE_PENDING_ASSIGNMENT_SLUG,
  SAMPLE_INVITE_PENDING_LEGACY_TITLE,
  SAMPLE_INVITE_PENDING_TITLE,
  SAMPLE_QUEUE_META,
  SAMPLE_QUEUE_TITLE,
  SAMPLE_REVIEW_META,
  SAMPLE_REVIEW_TITLE,
  SAMPLE_REVISIONS_META,
  SAMPLE_REVISIONS_TITLE,
  sampleJournalMetadata,
  seedJournalId,
} from './sample-content';
import {
  attachStandardFilePackage,
  promoteManuscriptsToReviewPackage,
  sampleMulterFile,
} from './sample-files';

export async function findSampleSubmission(
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
  submissionsService: SeedContext['submissionsService'],
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
  submissionsService: SeedContext['submissionsService'],
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

/** Draft through copyedit, including invite repair and the education section editor. */
export async function seedWorkflowSamples(options: {
  ctx: SeedContext;
  author: User;
  authorReq: RequestUser;
  reviewer: User;
  copyeditor: User;
  press: SeededPress;
  editors: SeedEditorRequests;
}): Promise<void> {
  const {
    ctx: { dataSource, submissionsService },
    author,
    authorReq,
    reviewer,
    copyeditor,
    press,
    editors,
  } = options;
  const editorReq = editors.econj;
  const edujEditorReq = editors.eduj;
  const lawjEditorReq = editors.lawj;
  const engjEditorReq = editors.engj;

  const tDraft = SAMPLE_DRAFT_TITLE;
  const tQueue = SAMPLE_QUEUE_TITLE;
  const tReview = SAMPLE_REVIEW_TITLE;
  const tCompleted = SAMPLE_COMPLETED_TITLE;
  const tRev = SAMPLE_REVISIONS_TITLE;
  const tInvitePending = SAMPLE_INVITE_PENDING_TITLE;
  const tCopyedit = SAMPLE_COPYEDIT_TITLE;

  // 1) Draft + file
  if (!(await findSampleSubmission(dataSource, author.id, tDraft))) {
    const s = await submissionsService.create(author.id, {
      title: tDraft,
      abstract:
        'This study develops and validates a scale for measuring digital learning competencies among undergraduate students and examines the effect of immediate formative feedback on academic achievement in higher-education courses.',
      ...sampleJournalMetadata(
        seedJournalId(press, SAMPLE_DISCIPLINE_EDUCATION),
      ),
      ...SAMPLE_DRAFT_META,
    });
    await attachStandardFilePackage(
      submissionsService,
      s.slug!,
      authorReq,
      minimalPdf(tDraft),
      'draft.pdf',
    );
    await syncSampleDiscipline(dataSource, s.id, {
      topLabel: SAMPLE_DISCIPLINE_EDUCATION,
      confidence: 76,
    });
    console.log(`Seeded: ${tDraft} (draft)`);
  }

  // 2) Submitted — stays in editor queue (no assignment)
  if (!(await findSampleSubmission(dataSource, author.id, tQueue))) {
    const s = await submissionsService.create(author.id, {
      title: tQueue,
      abstract:
        'This study examines the impact of open-access and digital-publishing policies on the dissemination of knowledge in Arabic peer-reviewed journals, comparing funding models and article processing charges across ten journals over the period 2020–2024.',
      ...sampleJournalMetadata(
        seedJournalId(press, queueSampleDisciplineLabel()),
      ),
      ...SAMPLE_QUEUE_META,
    });
    await attachStandardFilePackage(
      submissionsService,
      s.slug!,
      authorReq,
      minimalPdf(tQueue),
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
  if (!(await findSampleSubmission(dataSource, author.id, tReview))) {
    const s = await submissionsService.create(author.id, {
      title: tReview,
      abstract:
        'This paper analyses open-access and digital-publishing policy frameworks adopted by Arabic scholarly journals, evaluating their effect on knowledge diffusion and comparing sustainability models across regional and international peer-reviewed outlets.',
      ...sampleJournalMetadata(seedJournalId(press, SAMPLE_DISCIPLINE_DEFAULT)),
      ...SAMPLE_REVIEW_META,
    });
    await attachStandardFilePackage(
      submissionsService,
      s.slug!,
      authorReq,
      minimalPdf(tReview),
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
  if (!(await findSampleSubmission(dataSource, author.id, tCompleted))) {
    const s = await submissionsService.create(author.id, {
      title: tCompleted,
      abstract:
        'This study reviews personal-data protection provisions in selected contemporary Arab legal frameworks and compares them with the principles of the General Data Protection Regulation, focusing on data-subject consent, cross-border data transfers, and controller liability.',
      ...sampleJournalMetadata(seedJournalId(press, SAMPLE_DISCIPLINE_LEGAL)),
      ...SAMPLE_COMPLETED_META,
    });
    await attachStandardFilePackage(
      submissionsService,
      s.slug!,
      authorReq,
      minimalPdf(tCompleted),
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
      lawjEditorReq,
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
  if (!(await findSampleSubmission(dataSource, author.id, tRev))) {
    const s = await submissionsService.create(author.id, {
      title: tRev,
      abstract:
        'This study experimentally evaluates an immediate-feedback programme delivered through an e-learning platform in an introductory statistics course, comparing short-test and final-project outcomes between two groups while analysing student perceptions of instructional clarity.',
      ...sampleJournalMetadata(
        seedJournalId(press, SAMPLE_DISCIPLINE_EDUCATION),
      ),
      ...SAMPLE_REVISIONS_META,
    });
    await attachStandardFilePackage(
      submissionsService,
      s.slug!,
      authorReq,
      minimalPdf(tRev),
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
      edujEditorReq,
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
      edujEditorReq,
      SubmissionStatus.REVISIONS_REQUESTED,
      undefined,
      'Please address the reviewers’ comments on methodology and expand the discussion before resubmitting.',
      // Required since the revision-severity decision landed; matches the
      // reviewer note above ("recommend major revisions").
      { revisionSeverity: 'major' },
    );
    await submissionsService.addFile(
      s.slug!,
      authorReq,
      sampleMulterFile('revised-manuscript.pdf', minimalPdf(tRev)),
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
      edujEditorReq,
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
        edujEditorReq,
      );
      if (repaired) {
        console.log(
          `Repaired: ${tRev} (new invited assignment — round-2 invite was missing or already accepted)`,
        );
      }
    }
  }

  // 5b) Reviewer invite pending — only sample that sends reviewer-invited email during seed
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
      ...sampleJournalMetadata(seedJournalId(press, SAMPLE_DISCIPLINE_DEFAULT)),
      ...SAMPLE_QUEUE_META,
    });
    await attachStandardFilePackage(
      submissionsService,
      s.slug!,
      authorReq,
      minimalPdf(tInvitePending),
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
  if (!(await findSampleSubmission(dataSource, author.id, tCopyedit))) {
    const s = await submissionsService.create(author.id, {
      title: tCopyedit,
      abstract:
        'This paper proposes an energy-efficient routing protocol for wireless sensor networks deployed in industrial IoT environments, comparing response time and power consumption against reference protocols across three load scenarios.',
      ...sampleJournalMetadata(
        seedJournalId(press, SAMPLE_DISCIPLINE_ENGINEERING),
      ),
      ...SAMPLE_COPYEDIT_META,
    });
    await attachStandardFilePackage(
      submissionsService,
      s.slug!,
      authorReq,
      minimalPdf(tCopyedit),
      'copyedit.pdf',
    );
    await submissionsService.submit(s.slug!, authorReq);
    await syncSampleDiscipline(dataSource, s.id, {
      topLabel: SAMPLE_DISCIPLINE_ENGINEERING,
      confidence: 87,
    });
    await submissionsService.updateStatus(
      s.slug!,
      engjEditorReq,
      SubmissionStatus.ACCEPTED,
    );
    const ceAssignment = await submissionsService.assignCopyeditor(
      s.slug!,
      copyeditor.id,
      engjEditorReq,
    );
    await submissionsService.submitCopyeditNote(
      ceAssignment.slug!,
      copyeditor.id,
      'Minor style edits applied to technical terms in the abstract. Please confirm the routing-protocol naming is consistent.',
      'No structural concerns; ready to publish once author acknowledges.',
    );
    console.log(`Seeded: ${tCopyedit} (copyediting, note submitted)`);
  }
}
