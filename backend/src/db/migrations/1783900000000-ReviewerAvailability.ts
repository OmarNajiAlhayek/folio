import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reviewer availability and concurrent-review limits.
 *
 * `willing_to_review` says whether someone is in the reviewer pool at all.
 * These columns say whether an editor may invite them *right now*:
 *
 * - `reviewer_available` — the reviewer's own switch. False blocks new
 *   invitations; pending ones can still be answered.
 * - `reviewer_unavailable_until` — the first day they are available again.
 *   Read-time logic treats a past date as available, so nothing has to run on
 *   that day to flip the switch back. NULL with the switch off is open-ended.
 * - `reviewer_unavailable_note` — shown to editors ("On sabbatical").
 * - `reviewer_max_active_reviews` — invited + accepted assignments allowed at
 *   once. NULL is no limit, which is what every existing reviewer keeps.
 *
 * The partial index serves the active-load count, which runs on every
 * directory load and inside every invitation's transaction.
 */
export class ReviewerAvailability1783900000000 implements MigrationInterface {
  name = 'ReviewerAvailability1783900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "reviewer_available" boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "reviewer_unavailable_until" date,
        ADD COLUMN IF NOT EXISTS "reviewer_unavailable_note" varchar(500),
        ADD COLUMN IF NOT EXISTS "reviewer_max_active_reviews" smallint
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP CONSTRAINT IF EXISTS "ck_users_reviewer_max_active_reviews",
        ADD CONSTRAINT "ck_users_reviewer_max_active_reviews"
          CHECK ("reviewer_max_active_reviews" IS NULL
             OR "reviewer_max_active_reviews" BETWEEN 1 AND 50)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_review_assignments_reviewer_active"
        ON "review_assignments" ("reviewer_id")
        WHERE "status" IN ('invited', 'accepted')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_review_assignments_reviewer_active"`,
    );
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP CONSTRAINT IF EXISTS "ck_users_reviewer_max_active_reviews",
        DROP COLUMN IF EXISTS "reviewer_max_active_reviews",
        DROP COLUMN IF EXISTS "reviewer_unavailable_note",
        DROP COLUMN IF EXISTS "reviewer_unavailable_until",
        DROP COLUMN IF EXISTS "reviewer_available"
    `);
  }
}
