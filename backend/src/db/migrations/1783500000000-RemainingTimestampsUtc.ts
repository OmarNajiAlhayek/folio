import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The last twelve naive `timestamp` columns become `timestamptz`, finishing
 * what `SubmissionTimestampsUtc1783400000000` started on `submissions` and
 * `SubmissionFilesCreatedAtTimestamptz1781800000000` started before it.
 *
 * `Init` created every one of them as `TIMESTAMP NOT NULL DEFAULT now()`, so
 * each carries the ambiguity those two migrations described: one column, two
 * writers, two different meanings.
 *
 * - TypeORM's `@CreateDateColumn` / `@UpdateDateColumn` generate the value in
 *   Node and store the **local** wall clock. node-postgres parses a naive
 *   column back as local, so that path round-trips.
 * - The column's own `DEFAULT now()` fires for any insert that does not name
 *   it — a raw `INSERT`, a restore, a `COPY` — and stores the **UTC** wall
 *   clock, which then reads back displaced by the server's UTC offset.
 *
 * Two call sites already read across that boundary:
 *
 * 1. `UsersService.list` filters `users.created_at` against
 *    `new Date('<yyyy-mm-dd>T00:00:00.000Z')` — an explicit UTC instant, which
 *    Postgres had to reinterpret in the server time zone to compare against a
 *    naive column. The staff-admin "joined between" filter was therefore off by
 *    the server offset and silently sliced the wrong day at each edge.
 * 2. `AuthChallengesService.assertCanSend` counts OTP sends in the last hour
 *    with `MoreThan(new Date(Date.now() - 3600_000))`. That one happens to
 *    round-trip today because every row is TypeORM-written, but it is a rate
 *    limiter resting on an assumption the column itself did not enforce.
 *
 * The rest are converted for the same reason the two earlier migrations gave:
 * a mixed-meaning column is a defect waiting for its first cross-boundary
 * reader, and the cost of removing the question is one ALTER per column.
 *
 * Measured on this machine (Node at UTC+3, Postgres storing UTC): two inserts
 * issued milliseconds apart, one through the column default and one binding a
 * JS Date, landed 180 minutes apart on a naive column and 0.1s apart on a
 * timestamptz one. The offset is the whole disagreement.
 *
 * Existing rows are reinterpreted as UTC — exact for `now()`-written values,
 * off by the server offset for TypeORM-written ones. Acceptable for the same
 * reason as before: there is no production data and `seed:fresh` is the reset.
 *
 * Every `_at` column in the schema is `timestamptz` after this, and every
 * entity declares the type explicitly so the metadata stops drifting from it.
 */
export class RemainingTimestampsUtc1783500000000 implements MigrationInterface {
  name = 'RemainingTimestampsUtc1783500000000';

  /** table -> the naive columns `Init` left behind. */
  private static readonly COLUMNS: ReadonlyArray<readonly [string, string[]]> =
    [
      ['ai_jobs', ['created_at', 'updated_at']],
      ['auth_challenges', ['created_at']],
      ['copyedit_assignments', ['assigned_at']],
      ['notifications', ['created_at']],
      ['oauth_identities', ['created_at', 'updated_at']],
      ['outbound_event_outbox', ['created_at']],
      ['review_assignments', ['assigned_at']],
      ['role_invitations', ['created_at']],
      ['users', ['created_at', 'updated_at']],
    ];

  private async retype(
    queryRunner: QueryRunner,
    type: 'timestamptz' | 'timestamp',
  ): Promise<void> {
    for (const [
      table,
      columns,
    ] of RemainingTimestampsUtc1783500000000.COLUMNS) {
      for (const column of columns) {
        await queryRunner.query(
          `ALTER TABLE "${table}"
             ALTER COLUMN "${column}" TYPE ${type}
             USING "${column}" AT TIME ZONE 'UTC'`,
        );
      }
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.retype(queryRunner, 'timestamptz');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.retype(queryRunner, 'timestamp');
  }
}
