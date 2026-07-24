import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReviewerWorkflowEnhancements1782500000000 implements MigrationInterface {
  name = 'ReviewerWorkflowEnhancements1782500000000';

  // ALTER TYPE ... ADD VALUE cannot run inside a PG transaction
  public transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    // Enum additions must precede the transaction block
    await queryRunner.query(
      `ALTER TYPE "public"."reviews_recommendation_enum" ADD VALUE IF NOT EXISTS 'resubmit_for_review'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."reviews_recommendation_enum" ADD VALUE IF NOT EXISTS 'resubmit_elsewhere'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."reviews_recommendation_enum" ADD VALUE IF NOT EXISTS 'see_comments'`,
    );

    await queryRunner.startTransaction();
    try {
      await queryRunner.query(`
        ALTER TABLE "review_assignments"
          ADD COLUMN IF NOT EXISTS "response_due_at"     TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS "review_due_at"       TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS "assigned_by_id"      UUID REFERENCES "users"("id") ON DELETE SET NULL,
          ADD COLUMN IF NOT EXISTS "editor_instructions" TEXT NOT NULL DEFAULT ''
      `);

      await queryRunner.query(`
        ALTER TABLE "submission_files"
          ADD COLUMN IF NOT EXISTS "review_assignment_id" UUID REFERENCES "review_assignments"("id") ON DELETE CASCADE
      `);

      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "journal_settings" (
          "id"    uuid NOT NULL DEFAULT uuid_generate_v4(),
          "key"   varchar(100) NOT NULL,
          "value" text NOT NULL DEFAULT '',
          CONSTRAINT "PK_journal_settings" PRIMARY KEY ("id"),
          CONSTRAINT "UQ_journal_settings_key" UNIQUE ("key")
        )
      `);
      await queryRunner.query(`
        INSERT INTO "journal_settings" ("key")
        VALUES ('reviewer_guidelines')
        ON CONFLICT ("key") DO NOTHING
      `);

      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "review_discussions" (
          "id"            uuid NOT NULL DEFAULT uuid_generate_v4(),
          "assignment_id" uuid NOT NULL REFERENCES "review_assignments"("id") ON DELETE CASCADE,
          "subject"       varchar(500) NOT NULL DEFAULT '',
          "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT "PK_review_discussions" PRIMARY KEY ("id")
        )
      `);
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "ix_review_discussions_assignment" ON "review_discussions"("assignment_id")`,
      );

      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "review_discussion_messages" (
          "id"            uuid NOT NULL DEFAULT uuid_generate_v4(),
          "discussion_id" uuid NOT NULL REFERENCES "review_discussions"("id") ON DELETE CASCADE,
          "author_id"     uuid NOT NULL REFERENCES "users"("id"),
          "body"          text NOT NULL DEFAULT '',
          "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT "PK_review_discussion_messages" PRIMARY KEY ("id")
        )
      `);
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "ix_rdm_discussion_created" ON "review_discussion_messages"("discussion_id","created_at")`,
      );

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
        `DROP INDEX IF EXISTS "ix_rdm_discussion_created"`,
      );
      await queryRunner.query(
        `DROP TABLE IF EXISTS "review_discussion_messages"`,
      );
      await queryRunner.query(
        `DROP INDEX IF EXISTS "ix_review_discussions_assignment"`,
      );
      await queryRunner.query(`DROP TABLE IF EXISTS "review_discussions"`);
      await queryRunner.query(`DROP TABLE IF EXISTS "journal_settings"`);
      await queryRunner.query(
        `ALTER TABLE "submission_files" DROP COLUMN IF EXISTS "review_assignment_id"`,
      );
      await queryRunner.query(
        `ALTER TABLE "review_assignments" DROP COLUMN IF EXISTS "editor_instructions"`,
      );
      await queryRunner.query(
        `ALTER TABLE "review_assignments" DROP COLUMN IF EXISTS "assigned_by_id"`,
      );
      await queryRunner.query(
        `ALTER TABLE "review_assignments" DROP COLUMN IF EXISTS "review_due_at"`,
      );
      await queryRunner.query(
        `ALTER TABLE "review_assignments" DROP COLUMN IF EXISTS "response_due_at"`,
      );
      await queryRunner.commitTransaction();
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    }
    // Note: PostgreSQL does not support removing enum values; down migration skips enum rollback
  }
}
