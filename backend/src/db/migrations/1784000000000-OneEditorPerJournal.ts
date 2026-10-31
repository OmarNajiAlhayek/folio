import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One editor-in-chief per journal.
 *
 * Section editors stay many-to-many: they are linked to sections, not seated
 * once per journal. Reviewer and copyeditor memberships stay many-to-many.
 * If a journal already has two editors-in-chief, the oldest row is kept so
 * the unique index can be created.
 */
export class OneEditorPerJournal1784000000000 implements MigrationInterface {
  name = 'OneEditorPerJournal1784000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "journal_memberships" AS extra
      USING "journal_memberships" AS kept
      WHERE extra."role_slug" = 'editor'
        AND kept."role_slug" = extra."role_slug"
        AND kept."journal_id" = extra."journal_id"
        AND kept."id" <> extra."id"
        AND (
          kept."created_at" < extra."created_at"
          OR (kept."created_at" = extra."created_at" AND kept."id" < extra."id")
        )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_journal_memberships_one_editor"
        ON "journal_memberships" ("journal_id")
        WHERE "role_slug" = 'editor'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_journal_memberships_one_section_editor"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_journal_memberships_one_editor"`,
    );
  }
}
