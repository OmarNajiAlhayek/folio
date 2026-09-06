import type { EntityManager } from 'typeorm';
import { SubmissionFile } from '../entities/submission-file.entity';

/** Drops every public file on a submission (retract, or before a re-publish). */
export async function clearPublicSubmissionFiles(
  em: EntityManager,
  submissionId: string,
): Promise<void> {
  await em
    .getRepository(SubmissionFile)
    .createQueryBuilder()
    .update(SubmissionFile)
    .set({ isPublic: false })
    .where('submission_id = :submissionId', { submissionId })
    .andWhere('is_public = true')
    .execute();
}

/**
 * Marks exactly one manuscript file as the public version of a submission.
 *
 * Publishing used to flip `isPublic` on every row with `kind: 'manuscript'`.
 * Authors upload under that kind at each stage — the original pre-review
 * submission, every revision round, every copyedit round — so publishing
 * exposed the whole history. Those earlier versions routinely carry tracked
 * changes and identifying metadata, and the public download route serves
 * `PUBLISHED && isPublic` without authenticating, so they were world-readable.
 *
 * Only the newest manuscript is published; every other file on the submission
 * is explicitly demoted, which also repairs rows left public by the old
 * behaviour when a submission is re-published.
 *
 * @returns the id of the published file, or null when there is no manuscript.
 */
export async function setPublishedManuscriptFile(
  em: EntityManager,
  submissionId: string,
): Promise<string | null> {
  const repo = em.getRepository(SubmissionFile);

  const newest = await repo.findOne({
    where: { submissionId, kind: 'manuscript' },
    order: { createdAt: 'DESC', id: 'DESC' },
    select: ['id'],
  });

  // Demote everything first so a re-publish cannot leave an older version
  // public alongside the current one.
  await clearPublicSubmissionFiles(em, submissionId);

  if (!newest) {
    return null;
  }

  await repo.update({ id: newest.id }, { isPublic: true });
  return newest.id;
}
