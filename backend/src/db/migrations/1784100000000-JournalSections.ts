import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * OJS-style sections inside each journal.
 *
 * The author picks a journal and a section. Section editors are linked to
 * sections, not one per journal. A submission can be assigned to every
 * editor of its section. The journal-manager seat moves into
 * `journal_memberships`, one person per journal.
 */
export class JournalSections1784100000000 implements MigrationInterface {
  name = 'JournalSections1784100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "sections" (
        "id"          uuid         NOT NULL,
        "journal_id"  uuid         NOT NULL REFERENCES "journals"("id") ON DELETE CASCADE,
        "name_ar"     varchar(200) NOT NULL,
        "name_en"     varchar(200) NOT NULL,
        "sort_order"  int          NOT NULL DEFAULT 0,
        "is_active"   boolean      NOT NULL DEFAULT true,
        "created_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sections" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_sections_journal_sort" ON "sections" ("journal_id", "sort_order")`,
    );

    await queryRunner.query(`
      CREATE TABLE "section_editors" (
        "id"                   uuid    NOT NULL,
        "section_id"           uuid    NOT NULL REFERENCES "sections"("id") ON DELETE CASCADE,
        "user_id"              uuid    NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "can_record_decision"  boolean NOT NULL DEFAULT false,
        "created_at"           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_section_editors" PRIMARY KEY ("id"),
        CONSTRAINT "uq_section_editors_section_user" UNIQUE ("section_id", "user_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_section_editors_user" ON "section_editors" ("user_id")`,
    );

    await queryRunner.query(`
      ALTER TABLE "submissions"
        ADD COLUMN "section_id" uuid NULL REFERENCES "sections"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_submissions_section" ON "submissions" ("section_id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "section_editor_assignments" DROP CONSTRAINT "UQ_sea_submission_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "section_editor_assignments"
        ADD COLUMN "can_record_decision" boolean NOT NULL DEFAULT false,
        ADD COLUMN "recommendation" text NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "section_editor_assignments"
        ADD CONSTRAINT "uq_sea_submission_editor" UNIQUE ("submission_id", "section_editor_id")
    `);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_journal_memberships_one_section_editor"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_journal_memberships_one_journal_manager"
        ON "journal_memberships" ("journal_id")
        WHERE "role_slug" = 'journal_manager'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_journal_memberships_one_journal_manager"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_journal_memberships_one_section_editor"
        ON "journal_memberships" ("journal_id")
        WHERE "role_slug" = 'section_editor'
    `);
    await queryRunner.query(
      `ALTER TABLE "section_editor_assignments" DROP CONSTRAINT IF EXISTS "uq_sea_submission_editor"`,
    );
    await queryRunner.query(`
      ALTER TABLE "section_editor_assignments"
        DROP COLUMN IF EXISTS "recommendation",
        DROP COLUMN IF EXISTS "can_record_decision"
    `);
    await queryRunner.query(`
      ALTER TABLE "section_editor_assignments"
        ADD CONSTRAINT "UQ_sea_submission_id" UNIQUE ("submission_id")
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_submissions_section"`);
    await queryRunner.query(
      `ALTER TABLE "submissions" DROP COLUMN IF EXISTS "section_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "section_editors"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sections"`);
  }
}
