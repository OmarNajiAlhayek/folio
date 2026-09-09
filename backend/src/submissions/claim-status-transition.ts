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
    .set({
      status: next,
      // Advance the modification stamp here, because nothing else will.
      //
      // Callers follow this with `save(entity)`, and by then the database
      // already holds `next` — TypeORM diffs against current database state,
      // finds nothing changed, skips the UPDATE, and `@UpdateDateColumn` never
      // fires. Two writes that each look correct cancelled each other out, so
      // a status change left `updated_at` untouched: the editor queue's
      // `ix_submissions_journal_status_updated_at` ordering never saw a
      // decision, and an OAI harvester was never told a retraction happened.
      updatedAt: () => 'now()',
    })
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
