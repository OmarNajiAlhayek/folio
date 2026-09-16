import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-journal editorial boards: the people a reader and DOAJ see listed on
 * `/journals/<slug>/editorial-board`, entered by the journal manager or the
 * journal's editor-in-chief (Damascus University, 2026-09-14).
 *
 * Separate from `journal_memberships`, which scopes staff *accounts*. Board
 * members are mostly people who never log in.
 *
 * The role list is written out here rather than imported from the entity, so
 * this migration keeps meaning what it meant if the list later grows.
 */
export class EditorialBoard1783700000000 implements MigrationInterface {
  name = 'EditorialBoard1783700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "editorial_board_members" (
        "id"             uuid         NOT NULL,
        "journal_id"     uuid         NOT NULL REFERENCES "journals"("id") ON DELETE CASCADE,
        "name_ar"        varchar(200),
        "name_en"        varchar(200),
        "role"           varchar(30)  NOT NULL,
        "affiliation_ar" varchar(300),
        "affiliation_en" varchar(300),
        "orcid"          varchar(19),
        "sort_order"     int          NOT NULL DEFAULT 0,
        "created_at"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_editorial_board_members" PRIMARY KEY ("id"),
        CONSTRAINT "ck_editorial_board_members_role" CHECK ("role" IN
          ('editor_in_chief', 'deputy_editor_in_chief', 'managing_editor', 'member', 'advisory_member')),
        CONSTRAINT "ck_editorial_board_members_name" CHECK ("name_ar" IS NOT NULL OR "name_en" IS NOT NULL)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_editorial_board_members_journal_sort" ON "editorial_board_members" ("journal_id", "sort_order")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "editorial_board_members"`);
  }
}
