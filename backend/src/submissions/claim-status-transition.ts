import { ConflictException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { Submission } from '../entities/submission.entity';
import type { SubmissionStatus } from '../entities/submission-status.enum';

/**
 * Compare-and-swap on `submissions.status`.
 *
 * Every workflow method reads the submission, validates the transition, then
 * writes — with the read outside the transaction and no row lock. Two editors
 * deciding at the same moment therefore both saw `submitted`, both passed
 * `EDITOR_TRANSITIONS`, and both enqueued a decision email under a different
 * idempotency key (`submission_decision:<slug>:<decision>`), so the author
 * received an acceptance *and* a rejection. Last write won in the database,
 * leaving the record disagreeing with the letters that went out.
 *
 * This turns the write into `UPDATE … WHERE status = <what we validated>`.
 * Under Postgres READ COMMITTED the second transaction blocks on the row, then
 * re-evaluates the predicate against the committed row and matches nothing —
 * so exactly one caller proceeds and the other is told to reload.
 *
 * Call it inside the transaction, before enqueueing any notification.
 *
 * @throws ConflictException when another caller already moved the submission.
 */
export async function claimStatusTransition(
  em: EntityManager,
  submissionId: string,
  expectedCurrent: SubmissionStatus,
  next: SubmissionStatus,
): Promise<void> {
  const result = await em
    .getRepository(Submission)
    .createQueryBuilder()
    .update(Submission)
    .set({ status: next })
    .where('id = :id', { id: submissionId })
    .andWhere('status = :expectedCurrent', { expectedCurrent })
    .execute();

  if (!result.affected) {
    throw new ConflictException({
      message:
        'This submission was changed by someone else while you were working on it. Reload and try again.',
      code: 'SUBMISSION_STATUS_CONFLICT',
      expectedStatus: expectedCurrent,
    });
  }
}
