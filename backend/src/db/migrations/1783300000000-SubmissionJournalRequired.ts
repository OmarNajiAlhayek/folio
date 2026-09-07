import { MigrationInterface, QueryRunner } from 'typeorm';
import { JOURNAL_FALLBACK_SLUG } from '../../journals/journal-catalog';

/**
 * Slice 6 closes what slice 1 deliberately left open.
 *
 * `MultiJournalIssues` added `submissions.journal_id` as NULLABLE because
 * `POST /submissions` had no way to set it — the author picker did not exist
 * yet. It does now (`CreateSubmissionDto.journalId`), so every new manuscript
 * arrives with a journal and the column can carry the constraint that makes
 * the editorial model true: an article always has an editorial home.
 *
 * The backfill repeats slice 1's placement rule for any row created in the
 * window between the two migrations. There is no production data; `seed:fresh`
 * remains the expected reset.
 */
export class SubmissionJournalRequired1783300000000 implements MigrationInterface {
  name = 'SubmissionJournalRequired1783300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "submissions" s
          SET "journal_id" = j."id"
         FROM "journals" j
        WHERE s."journal_id" IS NULL
          AND array_length(s."disciplines", 1) >= 1
          AND j."discipline_label" = s."disciplines"[1]`,
    );
    await queryRunner.query(
      `UPDATE "submissions"
          SET "journal_id" = (SELECT "id" FROM "journals" WHERE "slug" = $1)
        WHERE "journal_id" IS NULL`,
      [JOURNAL_FALLBACK_SLUG],
    );

    await queryRunner.query(
      `ALTER TABLE "submissions" ALTER COLUMN "journal_id" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "submissions" ALTER COLUMN "journal_id" DROP NOT NULL`,
    );
  }
}
