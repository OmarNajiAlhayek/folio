import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `submissions.created_at` / `updated_at` become `timestamptz`.
 *
 * They were declared without an explicit type, so Postgres made them
 * `timestamp without time zone` — and a naive column cannot say what instant it
 * holds, which turned out to matter because two write paths disagreed about
 * the answer:
 *
 * - TypeORM writing a JS `Date` stores the **local** wall clock, and
 *   node-postgres parses it back as local, so that path round-trips correctly.
 * - SQL `now()` stores the **UTC** wall clock into the same column, which then
 *   reads back displaced by the server's UTC offset.
 *
 * Both are "correct" in isolation and they cannot both be right in one column.
 * It surfaced through OAI-PMH, where the datestamp is the value a harvester
 * hands back as `from=` on its next incremental harvest, so a displaced one
 * silently drops records — but the ambiguity was never specific to OAI.
 *
 * `timestamptz` removes the question: both paths store an instant, the driver
 * returns an instant, and comparisons stop depending on the server's zone.
 * This is what the tables added by the multi-journal rebuild (`journals`,
 * `journal_issues`, `journal_memberships`, …) already use — this migration
 * brings the oldest and busiest table up to the same convention.
 *
 * Existing rows are reinterpreted as UTC. That is exact for `now()`-written
 * values and off by the server offset for TypeORM-written ones, which is
 * acceptable precisely because there is no production data: `seed:fresh` is the
 * expected reset and rewrites every row.
 *
 * Ten other entities still carry naive `created_at`/`updated_at` (`users`,
 * `notifications`, `review_assignments`, `ai_jobs`, …). They are untouched here
 * because nothing in this phase reads them across the boundary; converting them
 * is the same three lines per table when someone wants it.
 */
export class SubmissionTimestampsUtc1783400000000 implements MigrationInterface {
  name = 'SubmissionTimestampsUtc1783400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "submissions"
         ALTER COLUMN "created_at" TYPE timestamptz
         USING "created_at" AT TIME ZONE 'UTC'`,
    );
    await queryRunner.query(
      `ALTER TABLE "submissions"
         ALTER COLUMN "updated_at" TYPE timestamptz
         USING "updated_at" AT TIME ZONE 'UTC'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "submissions"
         ALTER COLUMN "updated_at" TYPE timestamp
         USING "updated_at" AT TIME ZONE 'UTC'`,
    );
    await queryRunner.query(
      `ALTER TABLE "submissions"
         ALTER COLUMN "created_at" TYPE timestamp
         USING "created_at" AT TIME ZONE 'UTC'`,
    );
  }
}
