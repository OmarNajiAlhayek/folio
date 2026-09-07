import { MigrationInterface, QueryRunner } from 'typeorm';
import { generateEntityId } from '@folio/shared';
import { ROLE_SLUGS } from '../../rbac/permission-slugs';

type LegacyScopeRow = { userId: string; journalId: string };

/**
 * Retires `user_section_editor_disciplines` in favour of `journal_memberships`.
 *
 * Both tables answer the same question — "which slice of the press may this
 * section editor act in" — but the old one keyed on an Arabic classifier label,
 * which meant the label was a second taxonomy living beside `journals`. Since
 * `journals.discipline_label` is unique and 1:1 with those labels, every
 * existing row maps to exactly one journal and the mapping is lossless.
 *
 * Ids are generated app-side (UUID v7) to match every other table; the columns
 * carry no database-side default.
 */
export class JournalScopedSectionEditors1783200000000 implements MigrationInterface {
  name = 'JournalScopedSectionEditors1783200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT d."user_id" AS "userId", j."id" AS "journalId"
         FROM "user_section_editor_disciplines" d
         JOIN "journals" j ON j."discipline_label" = d."discipline_label"`,
    )) as LegacyScopeRow[];

    for (const row of rows) {
      await queryRunner.query(
        `INSERT INTO "journal_memberships"
           ("id", "journal_id", "user_id", "role_slug")
         VALUES ($1, $2, $3, $4)
         ON CONFLICT ON CONSTRAINT "uq_journal_memberships_journal_user_role"
         DO NOTHING`,
        [
          generateEntityId(),
          row.journalId,
          row.userId,
          ROLE_SLUGS.SECTION_EDITOR,
        ],
      );
    }

    await queryRunner.query(
      `DROP TABLE IF EXISTS "user_section_editor_disciplines"`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_section_editor_disciplines" (
        "user_id"          uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "discipline_label" text NOT NULL,
        CONSTRAINT "PK_user_section_editor_disciplines" PRIMARY KEY ("user_id", "discipline_label")
      )
    `);
    await queryRunner.query(
      `INSERT INTO "user_section_editor_disciplines" ("user_id", "discipline_label")
       SELECT m."user_id", j."discipline_label"
         FROM "journal_memberships" m
         JOIN "journals" j ON j."id" = m."journal_id"
        WHERE m."role_slug" = $1
       ON CONFLICT DO NOTHING`,
      [ROLE_SLUGS.SECTION_EDITOR],
    );
    await queryRunner.query(
      `DELETE FROM "journal_memberships" WHERE "role_slug" = $1`,
      [ROLE_SLUGS.SECTION_EDITOR],
    );
  }
}
