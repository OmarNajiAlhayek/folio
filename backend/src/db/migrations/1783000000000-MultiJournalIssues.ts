import { MigrationInterface, QueryRunner } from 'typeorm';
import { generateEntityId } from '@folio/shared';
import {
  JOURNAL_CATALOG,
  JOURNAL_FALLBACK_SLUG,
  assertJournalCatalogMatchesDisciplines,
} from '../../journals/journal-catalog';

/**
 * Turns Folio from one journal with discipline tags into a university press of
 * many journals, each with its own issues (العدد، السنة).
 *
 * The nine journal rows are reference data and are inserted here rather than
 * left to `seed.ts`, so the `submissions.journal_id` foreign key is satisfiable
 * on any database the moment the migration lands. `seed.ts` looks them up by
 * slug and never re-creates them.
 *
 * `journal_id` stays NULLABLE in this migration: `POST /submissions` cannot set
 * it until the author journal picker ships, and a NOT NULL column would break
 * submission creation in between. A follow-up migration tightens it.
 */
export class MultiJournalIssues1783000000000 implements MigrationInterface {
  name = 'MultiJournalIssues1783000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    assertJournalCatalogMatchesDisciplines();

    await queryRunner.query(`
      CREATE TABLE "journals" (
        "id"               uuid         NOT NULL,
        "slug"             varchar(40)  NOT NULL,
        "title_ar"         varchar(300) NOT NULL,
        "title_en"         varchar(300) NOT NULL,
        "discipline_label" text         NOT NULL,
        "issn"             varchar(20),
        "eissn"            varchar(20),
        "description_ar"   text,
        "description_en"   text,
        "is_active"        boolean      NOT NULL DEFAULT true,
        "sort_order"       int          NOT NULL DEFAULT 0,
        "created_at"       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_journals" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_journals_slug" UNIQUE ("slug"),
        CONSTRAINT "UQ_journals_discipline_label" UNIQUE ("discipline_label")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_journals_active_sort" ON "journals" ("is_active", "sort_order")`,
    );

    // Ids are UUID v7 from the app generator, matching every other entity.
    for (const j of JOURNAL_CATALOG) {
      await queryRunner.query(
        `INSERT INTO "journals"
           ("id", "slug", "title_ar", "title_en", "discipline_label", "sort_order")
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          generateEntityId(),
          j.slug,
          j.titleAr,
          j.titleEn,
          j.disciplineLabel,
          j.sortOrder,
        ],
      );
    }

    await queryRunner.query(
      `CREATE TYPE "public"."journal_issues_status_enum" AS ENUM ('planned', 'open', 'published', 'closed')`,
    );
    await queryRunner.query(`
      CREATE TABLE "journal_issues" (
        "id"           uuid         NOT NULL,
        "journal_id"   uuid         NOT NULL REFERENCES "journals"("id") ON DELETE CASCADE,
        "year"         int          NOT NULL,
        "number"       int          NOT NULL,
        "volume"       int,
        "title_ar"     varchar(300),
        "title_en"     varchar(300),
        "status"       "public"."journal_issues_status_enum" NOT NULL DEFAULT 'planned',
        "published_at" TIMESTAMP WITH TIME ZONE,
        "created_at"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_journal_issues" PRIMARY KEY ("id"),
        CONSTRAINT "uq_journal_issues_journal_year_number" UNIQUE ("journal_id", "year", "number"),
        CONSTRAINT "ck_journal_issues_number_positive" CHECK ("number" > 0),
        CONSTRAINT "ck_journal_issues_volume_positive" CHECK ("volume" IS NULL OR "volume" > 0),
        CONSTRAINT "ck_journal_issues_year_range" CHECK ("year" BETWEEN 1900 AND 2200)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_journal_issues_status_published_at" ON "journal_issues" ("status", "published_at")`,
    );

    // Scope, not permission: RBAC still grants the role globally, this says
    // which journals the holder may act in. `journal_manager` stays global.
    await queryRunner.query(`
      CREATE TABLE "journal_memberships" (
        "id"         uuid        NOT NULL,
        "journal_id" uuid        NOT NULL REFERENCES "journals"("id") ON DELETE CASCADE,
        "user_id"    uuid        NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "role_slug"  varchar(30) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_journal_memberships" PRIMARY KEY ("id"),
        CONSTRAINT "uq_journal_memberships_journal_user_role" UNIQUE ("journal_id", "user_id", "role_slug")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_journal_memberships_user_role" ON "journal_memberships" ("user_id", "role_slug")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_journal_memberships_journal_role" ON "journal_memberships" ("journal_id", "role_slug")`,
    );

    await queryRunner.query(`
      ALTER TABLE "submissions"
        ADD COLUMN IF NOT EXISTS "journal_id" uuid REFERENCES "journals"("id") ON DELETE RESTRICT,
        ADD COLUMN IF NOT EXISTS "issue_id"   uuid REFERENCES "journal_issues"("id") ON DELETE RESTRICT
    `);

    // Dev-database convenience only — there is no production data. Pre-multi-journal
    // rows are placed by their first confirmed discipline so local fixtures stay
    // coherent; anything unclassified lands in the widest journal. `seed:fresh`
    // is still the expected reset.
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
      `CREATE INDEX "ix_submissions_journal_status_updated_at" ON "submissions" ("journal_id", "status", "updated_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_submissions_issue_published_at" ON "submissions" ("issue_id", "published_at")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_submissions_issue_published_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_submissions_journal_status_updated_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "submissions" DROP COLUMN IF EXISTS "issue_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "submissions" DROP COLUMN IF EXISTS "journal_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "journal_memberships"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "journal_issues"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."journal_issues_status_enum"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "journals"`);
  }
}
