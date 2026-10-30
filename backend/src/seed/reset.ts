import { unlinkSync } from 'fs';
import { join } from 'path';
import { DataSource, In, Like } from 'typeorm';
import { CopyeditAssignment } from '../entities/copyedit-assignment.entity';
import { CopyeditNote } from '../entities/copyedit-note.entity';
import { ReviewAssignment } from '../entities/review-assignment.entity';
import { Review } from '../entities/review.entity';
import { SubmissionFile } from '../entities/submission-file.entity';
import { Submission } from '../entities/submission.entity';
import { SAMPLE_TITLE_PREFIX } from './sample-content';
import { clearUploadFiles, uploadRoot } from './sample-files';

/**
 * Dev-only: wipe all app data (users, submissions, notifications, …).
 * RBAC catalog (roles/permissions) is kept; RbacService re-upserts on startup.
 */
export async function resetAllDevData(dataSource: DataSource): Promise<void> {
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

export async function resetSampleSubmissions(
  dataSource: DataSource,
): Promise<void> {
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
