import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds rendered output storage and exponential-backoff retry metadata to
 * email_log so the FailedEmailRetryerService can re-send without needing
 * to re-derive template variables from the original event.
 *
 * retry_count — number of cron-based retry attempts made so far.
 * next_retry_at — when the next retry is eligible; NULL means no retry scheduled.
 * rendered_subject / rendered_html / rendered_text — the fully-rendered
 *   output stored immediately before the first send attempt.
 *
 * The partial index on (next_retry_at, retry_count) WHERE status='failed'
 * keeps the retryer's claim query fast without touching non-failed rows.
 */
export class EmailLogRetryColumns1714600000015 implements MigrationInterface {
  name = 'EmailLogRetryColumns1714600000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "email"."email_log"
        ADD COLUMN IF NOT EXISTS "retry_count"      integer      NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "next_retry_at"    timestamptz  NULL,
        ADD COLUMN IF NOT EXISTS "rendered_subject" text         NULL,
        ADD COLUMN IF NOT EXISTS "rendered_html"    text         NULL,
        ADD COLUMN IF NOT EXISTS "rendered_text"    text         NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_email_log_retry"
        ON "email"."email_log" ("next_retry_at", "retry_count")
        WHERE "status" = 'failed' AND "next_retry_at" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "email"."ix_email_log_retry"`,
    );
    await queryRunner.query(`
      ALTER TABLE "email"."email_log"
        DROP COLUMN IF EXISTS "rendered_text",
        DROP COLUMN IF EXISTS "rendered_html",
        DROP COLUMN IF EXISTS "rendered_subject",
        DROP COLUMN IF EXISTS "next_retry_at",
        DROP COLUMN IF EXISTS "retry_count"
    `);
  }
}
