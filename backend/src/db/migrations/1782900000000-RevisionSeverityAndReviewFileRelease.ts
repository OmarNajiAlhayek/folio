import { MigrationInterface, QueryRunner } from 'typeorm';

export class RevisionSeverityAndReviewFileRelease1782900000000 implements MigrationInterface {
  name = 'RevisionSeverityAndReviewFileRelease1782900000000';

  // ALTER TYPE ... ADD VALUE cannot run inside a PG transaction
  public transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    // Enum additions must precede the transaction block
    await queryRunner.query(
      `ALTER TYPE "public"."reviews_recommendation_enum" ADD VALUE IF NOT EXISTS 'minor_revisions'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."reviews_recommendation_enum" ADD VALUE IF NOT EXISTS 'major_revisions'`,
    );

    await queryRunner.startTransaction();
    try {
      // Severity is an orthogonal axis to `status`: the status stays
      // `revisions_requested` so every existing guard keeps working.
      await queryRunner.query(`
        ALTER TABLE "submissions"
          ADD COLUMN IF NOT EXISTS "revision_severity" varchar(10),
          ADD COLUMN IF NOT EXISTS "revision_round"    int NOT NULL DEFAULT 0
      `);

      // Reviewer-uploaded files stay editor-only until an editor releases them.
      await queryRunner.query(`
        ALTER TABLE "submission_files"
          ADD COLUMN IF NOT EXISTS "released_to_author_at" TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS "released_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL
      `);

      // Accept/decline time was never stored; the author timeline needs it.
      await queryRunner.query(`
        ALTER TABLE "review_assignments"
          ADD COLUMN IF NOT EXISTS "responded_at" TIMESTAMPTZ
      `);

      await queryRunner.commitTransaction();
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.startTransaction();
    try {
      await queryRunner.query(
        `ALTER TABLE "review_assignments" DROP COLUMN IF EXISTS "responded_at"`,
      );
      await queryRunner.query(
        `ALTER TABLE "submission_files" DROP COLUMN IF EXISTS "released_by_id"`,
      );
      await queryRunner.query(
        `ALTER TABLE "submission_files" DROP COLUMN IF EXISTS "released_to_author_at"`,
      );
      await queryRunner.query(
        `ALTER TABLE "submissions" DROP COLUMN IF EXISTS "revision_round"`,
      );
      await queryRunner.query(
        `ALTER TABLE "submissions" DROP COLUMN IF EXISTS "revision_severity"`,
      );
      await queryRunner.commitTransaction();
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    }
    // Note: PostgreSQL does not support removing enum values; down migration skips enum rollback
  }
}
