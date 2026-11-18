import { MigrationInterface, QueryRunner } from 'typeorm';
import { SEARCH_SCHEMA_SQL } from '../search-schema.sql';

/**
 * Removes the discipline (المجالات العلمية) taxonomy. Journals and sections are
 * the editorial home of an article now, so the per-submission discipline tags,
 * the AI suggestion columns and `journals.discipline_label` are dead weight.
 *
 * `journals.search_normalized` is a generated column that folds
 * `discipline_label`, so it must be dropped before the column and recreated
 * (the journals part of SEARCH_SCHEMA_SQL is idempotent and no longer uses it).
 *
 * `down()` restores the columns as nullable/empty; the old data is not
 * recoverable.
 */
export class RemoveDisciplines1784200000000 implements MigrationInterface {
  name = 'RemoveDisciplines1784200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_journals_search_normalized_trgm"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journals" DROP COLUMN IF EXISTS "search_normalized"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journals" DROP COLUMN IF EXISTS "discipline_label"`,
    );
    await queryRunner.query(SEARCH_SCHEMA_SQL);

    await queryRunner.query(`
      ALTER TABLE "submissions"
        DROP COLUMN IF EXISTS "disciplines",
        DROP COLUMN IF EXISTS "discipline_source",
        DROP COLUMN IF EXISTS "discipline_suggested_labels",
        DROP COLUMN IF EXISTS "discipline_suggested_confidence",
        DROP COLUMN IF EXISTS "discipline_classification"
    `);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."submissions_discipline_source_enum"`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."submissions_discipline_source_enum" AS ENUM ('ai', 'author', 'editor')`,
    );
    await queryRunner.query(`
      ALTER TABLE "submissions"
        ADD COLUMN "disciplines" text[] NOT NULL DEFAULT '{}',
        ADD COLUMN "discipline_source" "public"."submissions_discipline_source_enum",
        ADD COLUMN "discipline_suggested_labels" text[] NOT NULL DEFAULT '{}',
        ADD COLUMN "discipline_suggested_confidence" numeric(5,2),
        ADD COLUMN "discipline_classification" jsonb
    `);
    await queryRunner.query(
      `ALTER TABLE "journals" ADD COLUMN "discipline_label" text`,
    );
    await queryRunner.query(
      `UPDATE "journals" SET "discipline_label" = "slug"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journals" ALTER COLUMN "discipline_label" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "journals" ADD CONSTRAINT "UQ_journals_discipline_label" UNIQUE ("discipline_label")`,
    );
  }
}
