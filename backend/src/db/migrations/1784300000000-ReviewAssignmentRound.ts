import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Review rounds on assignments.
 *
 * `submissions.revision_round` already counts revision decisions. Stamping it
 * on each assignment lets "already assigned" be answered per round, so a
 * reviewer who finished in an earlier round can be invited to the next one
 * while a second invitation in the same round stays blocked.
 *
 * Backfill: decision timestamps are not stored, so the round an existing
 * assignment belonged to can't be derived. All existing rows default to round
 * 0. Assignments made after this migration get the live `revision_round`.
 */
export class ReviewAssignmentRound1784300000000 implements MigrationInterface {
  name = 'ReviewAssignmentRound1784300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "review_assignments"
        ADD COLUMN IF NOT EXISTS "round" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_review_assignments_submission_reviewer_round"
        ON "review_assignments" ("submission_id", "reviewer_id", "round")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_review_assignments_submission_reviewer_round"`,
    );
    await queryRunner.query(
      `ALTER TABLE "review_assignments" DROP COLUMN IF EXISTS "round"`,
    );
  }
}
